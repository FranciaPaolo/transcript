import logging
import threading
import time
from pathlib import Path
from typing import Optional

import whisper

from app.config import WHISPER_LANGUAGE, WHISPER_MODEL
from app.jobs.store import job_store
from app.models.schemas import JobStatus

logger = logging.getLogger(__name__)

_model: Optional[whisper.Whisper] = None
_model_lock = threading.Lock()


def get_model() -> whisper.Whisper:
    global _model
    with _model_lock:
        if _model is None:
            logger.info("Loading Whisper model '%s'...", WHISPER_MODEL)
            _model = whisper.load_model(WHISPER_MODEL)
            logger.info("Whisper model loaded.")
        return _model


def _audio_duration_seconds(path: Path) -> float:
    audio = whisper.load_audio(str(path))
    return len(audio) / whisper.audio.SAMPLE_RATE


def _estimate_transcription_seconds(duration: float) -> float:
    # Conservative CPU estimate: ~2x realtime for base model.
    return max(duration * 2.0, 5.0)


def transcribe_job(job_id: str) -> None:
    job = job_store.get(job_id)
    if job is None:
        return

    file_path = Path(job.file_path)

    try:
        job_store.update(job_id, status=JobStatus.processing, progress=5)

        duration = _audio_duration_seconds(file_path)
        estimated_seconds = _estimate_transcription_seconds(duration)
        job_store.update(job_id, progress=10)

        model = get_model()
        result_holder: dict[str, object] = {}
        error_holder: dict[str, Exception] = {}

        def run_transcription() -> None:
            try:
                result_holder["result"] = model.transcribe(
                    str(file_path),
                    language=WHISPER_LANGUAGE,
                    verbose=False,
                )
            except Exception as exc:
                error_holder["error"] = exc

        thread = threading.Thread(target=run_transcription, daemon=True)
        start = time.monotonic()
        thread.start()

        while thread.is_alive():
            elapsed = time.monotonic() - start
            progress = 10 + int(min(elapsed / estimated_seconds, 1.0) * 85)
            job_store.update(job_id, progress=min(progress, 95))
            time.sleep(0.5)

        thread.join()

        if "error" in error_holder:
            raise error_holder["error"]

        result = result_holder.get("result")
        if not isinstance(result, dict):
            raise RuntimeError("Transcription returned no result.")

        text = str(result.get("text", "")).strip()
        job_store.update(
            job_id,
            status=JobStatus.completed,
            progress=100,
            text=text,
        )
        logger.info("Job %s completed (%d chars).", job_id, len(text))

    except Exception as exc:
        logger.exception("Job %s failed.", job_id)
        job_store.update(
            job_id,
            status=JobStatus.error,
            progress=100,
            error=str(exc),
        )
    finally:
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        job_dir = file_path.parent
        if job_dir.exists() and not any(job_dir.iterdir()):
            job_dir.rmdir()

import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES, UPLOAD_DIR
from app.jobs.store import job_store
from app.models.schemas import JobResponse, JobStatus, TranscribeResponse
from app.services.whisper import transcribe_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["transcription"])


def _job_to_response(job) -> JobResponse:
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        filename=job.filename,
        text=job.text,
        error=job.error,
    )


@router.post("/transcribe", response_model=TranscribeResponse)
async def create_transcription(
    background_tasks: BackgroundTasks,
    file: UploadFile,
) -> TranscribeResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{extension}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds maximum size of 500 MB.")

    job = job_store.create(filename=file.filename, file_path="")
    job_dir = UPLOAD_DIR / job.job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename).name
    file_path = job_dir / safe_name
    file_path.write_bytes(content)
    job.file_path = str(file_path)

    background_tasks.add_task(transcribe_job, job.job_id)
    logger.info("Queued job %s for %s.", job.job_id, file.filename)

    return TranscribeResponse(job_id=job.job_id)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return _job_to_response(job)


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_stream():
        event = asyncio.Event()
        last_payload = ""

        def notify() -> None:
            event.set()

        if not job_store.subscribe(job_id, notify):
            return

        try:
            while True:
                current = job_store.get(job_id)
                if current is None:
                    break

                payload = json.dumps(
                    {
                        "job_id": current.job_id,
                        "status": current.status.value,
                        "progress": current.progress,
                        "text": current.text,
                        "error": current.error,
                    }
                )

                if payload != last_payload:
                    last_payload = payload
                    yield f"data: {payload}\n\n"

                if current.status in (JobStatus.completed, JobStatus.error):
                    break

                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            job_store.unsubscribe(job_id, notify)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

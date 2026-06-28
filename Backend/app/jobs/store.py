import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

from app.models.schemas import JobStatus


@dataclass
class Job:
    job_id: str
    filename: str
    file_path: str
    status: JobStatus = JobStatus.queued
    progress: int = 0
    text: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    listeners: list[Callable[[], None]] = field(default_factory=list, repr=False)


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, filename: str, file_path: str) -> Job:
        job = Job(job_id=str(uuid.uuid4()), filename=filename, file_path=file_path)
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: Optional[JobStatus] = None,
        progress: Optional[int] = None,
        text: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[Job]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None

            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = max(0, min(100, progress))
            if text is not None:
                job.text = text
            if error is not None:
                job.error = error

            listeners = list(job.listeners)

        for listener in listeners:
            listener()

        return job

    def subscribe(self, job_id: str, listener: Callable[[], None]) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            job.listeners.append(listener)
            return True

    def unsubscribe(self, job_id: str, listener: Callable[[], None]) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and listener in job.listeners:
                job.listeners.remove(listener)


job_store = JobStore()

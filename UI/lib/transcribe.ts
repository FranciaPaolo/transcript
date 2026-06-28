const ACCEPTED_EXTENSIONS = [".mp3", ".mp4"] as const;
const ACCEPTED_MIME_TYPES = ["audio/mpeg", "audio/mp3", "video/mp4"] as const;

export function isAcceptedMediaFile(file: File): boolean {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return true;
  }
  return ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number]);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function transcriptionFileName(originalName: string): string {
  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}.txt`;
}

const API_BASE =
  process.env.NEXT_PUBLIC_TRANSCRIBE_API_URL ?? "http://localhost:8000";

type JobStatusResponse = {
  job_id: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  filename: string;
  text?: string;
  error?: string;
};

async function uploadForTranscription(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the default message when the body is not JSON.
    }
    throw new Error(message);
  }

  const body = (await response.json()) as { job_id: string };
  return body.job_id;
}

async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch job status (${response.status})`);
  }
  return response.json() as Promise<JobStatusResponse>;
}

async function waitForTranscription(
  jobId: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (typeof EventSource !== "undefined") {
    return waitWithEventSource(jobId, onProgress);
  }
  return waitWithPolling(jobId, onProgress);
}

function waitWithEventSource(
  jobId: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${API_BASE}/api/jobs/${jobId}/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as JobStatusResponse;
      onProgress?.(data.progress);

      if (data.status === "completed") {
        eventSource.close();
        if (data.text) {
          resolve(data.text);
          return;
        }
        reject(new Error("Transcription completed without text."));
      } else if (data.status === "error") {
        eventSource.close();
        reject(new Error(data.error ?? "Transcription failed."));
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      void waitWithPolling(jobId, onProgress).then(resolve).catch(reject);
    };
  });
}

async function waitWithPolling(
  jobId: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  while (true) {
    const job = await pollJobStatus(jobId);
    onProgress?.(job.progress);

    if (job.status === "completed") {
      if (job.text) return job.text;
      throw new Error("Transcription completed without text.");
    }

    if (job.status === "error") {
      throw new Error(job.error ?? "Transcription failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function transcribeFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const jobId = await uploadForTranscription(file);
  return waitForTranscription(jobId, onProgress);
}

export function downloadTranscription(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

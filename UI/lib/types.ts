export type FileStatus = "queued" | "processing" | "completed" | "error";

export type UploadFileItem = {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  transcription?: string;
  error?: string;
};

export type UploadPhase = "idle" | "processing" | "complete";

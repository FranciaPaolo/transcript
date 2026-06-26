"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { UploadFileItem, UploadPhase } from "@/lib/types";
import {
  downloadTranscription,
  formatFileSize,
  isAcceptedMediaFile,
  transcribeFile,
  transcriptionFileName,
} from "@/lib/transcribe";

function createFileItem(file: File): UploadFileItem {
  return {
    id: crypto.randomUUID(),
    file,
    status: "queued",
    progress: 0,
  };
}

export function TranscriptionUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const isProcessing = phase === "processing";
  const completedFiles = useMemo(
    () => files.filter((item) => item.status === "completed"),
    [files],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const selected = Array.from(incoming);
      const accepted = selected.filter(isAcceptedMediaFile);
      const rejected = selected.length - accepted.length;

      if (rejected > 0) {
        setValidationMessage(
          rejected === 1
            ? "One file was skipped. Only MP3 and MP4 files are supported."
            : `${rejected} files were skipped. Only MP3 and MP4 files are supported.`,
        );
      } else {
        setValidationMessage(null);
      }

      if (accepted.length === 0) return;

      setFiles((current) => {
        const existingKeys = new Set(
          current.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`),
        );
        const nextItems = accepted
          .filter(
            (file) =>
              !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`),
          )
          .map(createFileItem);

        if (nextItems.length === 0) {
          setValidationMessage("Those files are already in the list.");
          return current;
        }

        return [...current, ...nextItems];
      });

      setPhase("idle");
    },
    [],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (isProcessing) return;
      if (event.dataTransfer.files.length > 0) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles, isProcessing],
  );

  const removeFile = useCallback(
    (id: string) => {
      if (isProcessing) return;
      setFiles((current) => current.filter((item) => item.id !== id));
      setValidationMessage(null);
      setPhase("idle");
    },
    [isProcessing],
  );

  const clearAll = useCallback(() => {
    if (isProcessing) return;
    setFiles([]);
    setValidationMessage(null);
    setPhase("idle");
  }, [isProcessing]);

  const handleSubmit = async () => {
    if (files.length === 0 || isProcessing) return;

    setPhase("processing");
    setValidationMessage(null);

    const queue = files.map((item) => ({ ...item, status: "queued" as const, progress: 0 }));
    setFiles(queue);

    for (const item of queue) {
      setFiles((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "processing", progress: 0, error: undefined }
            : entry,
        ),
      );

      try {
        const transcription = await transcribeFile(item.file, (progress) => {
          setFiles((current) =>
            current.map((entry) =>
              entry.id === item.id ? { ...entry, progress } : entry,
            ),
          );
        });

        setFiles((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "completed", progress: 100, transcription }
              : entry,
          ),
        );
      } catch {
        setFiles((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "error",
                  error: "Transcription failed. Try again when the API is connected.",
                }
              : entry,
          ),
        );
      }
    }

    setPhase("complete");
  };

  const overallProgress =
    files.length === 0
      ? 0
      : Math.round(
          files.reduce((sum, item) => sum + item.progress, 0) / files.length,
        );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Web Transcripts
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Upload media to transcribe
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Add one or more MP3 or MP4 files, then submit to transcribe them
          sequentially. Progress is shown for each file, and you can download
          a TXT transcript when processing finishes.
        </p>
      </header>

      <section
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isProcessing) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isProcessing) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={onDrop}
        className={[
          "rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
          isProcessing
            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-70 dark:border-zinc-800 dark:bg-zinc-950"
            : isDragging
              ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
              : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
            <UploadIcon />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
              Drag and drop files here
            </p>
            <p className="text-sm text-zinc-500">MP3 and MP4 only</p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.mp4,audio/mpeg,video/mp4"
            multiple
            className="hidden"
            disabled={isProcessing}
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
                event.target.value = "";
              }
            }}
          />
        </div>
      </section>

      {validationMessage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {validationMessage}
        </p>
      ) : null}

      {files.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
              Selected files ({files.length})
            </h2>
            {!isProcessing ? (
              <button
                type="button"
                onClick={clearAll}
                className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <ul className="space-y-3">
            {files.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                      {item.file.name}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatFileSize(item.file.size)} ·{" "}
                      {item.file.name.toLowerCase().endsWith(".mp4") ? "MP4" : "MP3"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={item.status} />
                    {!isProcessing && item.status !== "completed" ? (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-200"
                        aria-label={`Remove ${item.file.name}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                {item.status === "processing" || item.status === "completed" ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm text-zinc-500">
                      <span>Progress</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-zinc-900 transition-all duration-200 dark:bg-zinc-100"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {item.status === "error" && item.error ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    {item.error}
                  </p>
                ) : null}

                {item.status === "completed" && item.transcription ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        downloadTranscription(
                          item.transcription!,
                          transcriptionFileName(item.file.name),
                        )
                      }
                      className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Download {transcriptionFileName(item.file.name)}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {files.length > 0 ? (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Overall progress
              </p>
              <p className="text-sm text-zinc-500">
                {phase === "idle" && "Ready to transcribe"}
                {phase === "processing" && "Transcribing files one by one..."}
                {phase === "complete" &&
                  `${completedFiles.length} of ${files.length} files completed`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {phase === "complete" && completedFiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    for (const item of completedFiles) {
                      if (item.transcription) {
                        downloadTranscription(
                          item.transcription,
                          transcriptionFileName(item.file.name),
                        );
                      }
                    }
                  }}
                  className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-950"
                >
                  Download all TXT
                </button>
              ) : null}
              <button
                type="button"
                disabled={files.length === 0 || isProcessing}
                onClick={handleSubmit}
                className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {isProcessing ? "Transcribing..." : "Submit for transcription"}
              </button>
            </div>
          </div>

          {phase !== "idle" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>Total completion</span>
                <span>{overallProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all duration-200 dark:bg-zinc-100"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: UploadFileItem["status"] }) {
  const styles: Record<UploadFileItem["status"], string> = {
    queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };

  const labels: Record<UploadFileItem["status"], string> = {
    queued: "Queued",
    processing: "Processing",
    completed: "Completed",
    error: "Error",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 text-zinc-700 dark:text-zinc-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
      />
    </svg>
  );
}

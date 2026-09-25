"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Paperclip } from "lucide-react";
import { ACCEPT, fileExt, fileProblem, formatBytes } from "@/lib/files";
import { MAX_MESSAGE_FILES, type MessageFile } from "@/lib/message-files";
import { uploadMessageFiles } from "@/lib/upload";

/**
 * Files chosen for a message. `attach(fd)` uploads them (once, even if the
 * send is retried) and puts them in the form data as `attachments`.
 */
export function useMessageFiles(companyId: string) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const done = useRef(new Map<File, MessageFile>());

  const attach = async (fd: FormData): Promise<string | null> => {
    if (!files.length) return null;
    const bad = files.map((f) => fileProblem(f) && `${f.name}: ${fileProblem(f)}`).find(Boolean);
    if (bad) return bad;
    if (!companyId) return "Choose the customer first.";
    try {
      setProgress(0);
      fd.set("attachments", JSON.stringify(await uploadMessageFiles(companyId, files, done.current, setProgress)));
      return null;
    } catch (e) {
      return (e as Error).message;
    } finally {
      setProgress(null);
    }
  };
  const clear = () => {
    setFiles([]);
    done.current.clear();
  };
  return { files, setFiles, progress, attach, clear };
}

/** "Attach files" button and the chosen files (up to 5; PDF, JPG, PNG, XLSX, DOCX; 20 MB each). */
export function FilePicker({
  id,
  files,
  onChange,
  progress,
  tone = "light",
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  progress: number | null;
  tone?: "light" | "muted";
}) {
  const add = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)].slice(0, MAX_MESSAGE_FILES));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f, i) => {
        const problem = fileProblem(f);
        return (
          <div
            key={`${f.name}-${i}`}
            className={clsx(
              "grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-2.5 px-2.5 py-1.5 text-[13px]",
              problem ? "bg-accent-100" : tone === "muted" ? "bg-bg" : "bg-surface",
            )}
          >
            <span className={clsx("py-0.5 text-center font-mono text-[10px] font-semibold", problem ? "bg-accent text-bg" : "bg-neutral-200")}>{fileExt(f.name)}</span>
            <span className="min-w-0">
              <b className="block truncate">{f.name}</b>
              <span className={problem ? "font-extrabold text-accent-800" : "opacity-60"}>{problem ?? formatBytes(f.size)}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="cursor-pointer border-0 bg-transparent text-[18px]"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        {files.length < MAX_MESSAGE_FILES && (
          <label htmlFor={id} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 font-semibold text-text underline underline-offset-2">
            <Paperclip size={14} aria-hidden="true" />
            {files.length ? "Add another file" : "Attach files"}
            <input
              id={id}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <span className="opacity-60">PDF, JPG, PNG, XLSX, DOCX · up to {MAX_MESSAGE_FILES} files, 20 MB each</span>
        {progress !== null && <span className="font-semibold">Uploading… {progress}%</span>}
      </div>
    </div>
  );
}

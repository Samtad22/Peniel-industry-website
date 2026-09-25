"use client";

import { useState } from "react";
import clsx from "clsx";
import { ACCEPT, ARTWORK_ACCEPT, fileExt, fileProblem, formatBytes, type UploadKind } from "@/lib/files";

/** One file chosen with a drop zone or the file browser. */
export default function FileDrop({ file, onFile, id, kind = "document" }: { file: File | null; onFile: (f: File | null) => void; id: string; kind?: UploadKind }) {
  const [drag, setDrag] = useState(false);
  if (file) {
    const problem = fileProblem(file, kind);
    return (
      <div className={clsx("grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-2.5 p-2.5 text-[13px]", problem ? "bg-accent-100" : "bg-surface")}>
        <span className={clsx("py-1 text-center font-mono text-[10px] font-semibold", problem ? "bg-accent text-bg" : "bg-bg")}>{fileExt(file.name)}</span>
        <span className="min-w-0">
          <b className="block truncate">{file.name}</b>
          <span className={problem ? "font-extrabold text-accent-800" : "opacity-60"}>{problem ?? `${formatBytes(file.size)} · ready`}</span>
        </span>
        <button type="button" aria-label="Remove file" onClick={() => onFile(null)} className="cursor-pointer border-0 bg-transparent text-[18px]">
          ×
        </button>
      </div>
    );
  }
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFile(e.dataTransfer.files[0] ?? null);
      }}
      className={clsx(
        "flex cursor-pointer flex-col gap-1 border-2 border-dashed p-5 text-[13px]",
        drag ? "border-accent bg-accent-100" : "border-divider bg-neutral-100",
      )}
    >
      <b className="text-[15px]">
        Drop a file here or <span className="text-accent underline underline-offset-2">browse</span>
      </b>
      <span className="opacity-70">{kind === "artwork" ? "PDF, AI, EPS, JPG, PNG, XLSX, DOCX" : "PDF, JPG, PNG, XLSX, DOCX"} · up to 20 MB</span>
      <input id={id} type="file" accept={kind === "artwork" ? ARTWORK_ACCEPT : ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}


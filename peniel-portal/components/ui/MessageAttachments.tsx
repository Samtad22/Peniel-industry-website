import Link from "next/link";
import clsx from "clsx";
import { Lock } from "lucide-react";
import { fileExt, formatBytes } from "@/lib/files";
import { formatDateTime } from "@/lib/format";
import type { MessageAttachment } from "@/lib/message-files";

const href = (id: string) => `/files/messages/${id}`;

/** The files under one message bubble. */
export function AttachmentChips({ files, dark = false }: { files: MessageAttachment[]; dark?: boolean }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {files.map((f) => (
        <a
          key={f.id}
          href={href(f.id)}
          className={clsx(
            "grid min-h-10 grid-cols-[36px_minmax(0,1fr)_16px] items-center gap-2 px-2 py-1 text-[12px] no-underline",
            dark ? "bg-bg/10 text-bg hover:text-bg" : "bg-bg text-text hover:text-text",
          )}
        >
          <span className={clsx("py-0.5 text-center font-mono text-[10px] font-semibold", dark ? "bg-bg/20" : "bg-neutral-200")}>{fileExt(f.file_name)}</span>
          <span className="min-w-0">
            <b className="block truncate">{f.file_name}</b>
            <span className="opacity-70">{formatBytes(Number(f.size_bytes))}</span>
          </span>
          <span aria-hidden="true">↓</span>
        </a>
      ))}
    </div>
  );
}

export type FileRow = MessageAttachment & { from: string; internal?: boolean };

/** The conversation's Attachments tab: every file shared in it, newest first. */
export function AttachmentsTable({ files, empty }: { files: FileRow[]; empty: string }) {
  if (!files.length) return <p className="m-0 py-6 text-[14px] opacity-70">{empty}</p>;
  return (
    <div className="border-t-2 border-divider">
      {files.map((f) => (
        <a
          key={f.id}
          href={href(f.id)}
          className="grid min-h-14 grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-3 border-b border-divider py-2 text-[13px] text-text no-underline hover:bg-text/5 hover:text-text"
        >
          <span className="bg-surface py-1 text-center font-mono text-[10px] font-semibold">{fileExt(f.file_name)}</span>
          <span className="min-w-0">
            <b className="block truncate text-[14px]">{f.file_name}</b>
            <span className="flex flex-wrap items-center gap-x-1.5 opacity-70">
              {f.internal && (
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Lock size={11} aria-hidden="true" />
                  Internal note ·
                </span>
              )}
              {f.from} · {formatDateTime(f.created_at)} · {formatBytes(Number(f.size_bytes))}
            </span>
          </span>
          <span aria-hidden="true" className="text-accent">
            ↓
          </span>
        </a>
      ))}
    </div>
  );
}

/** "Conversation | Attachments (n)" tabs above a thread. */
export function ThreadTabs({ base, view, count }: { base: string; view: "messages" | "files"; count: number }) {
  const sep = base.includes("?") ? "&" : "?";
  const tabs = [
    ["messages", "Conversation", base],
    ["files", `Attachments${count ? ` (${count})` : ""}`, `${base}${sep}view=files`],
  ] as const;
  return (
    <div className="flex border-b-2 border-divider text-[14px]" role="tablist">
      {tabs.map(([k, label, link]) => (
        <Link
          key={k}
          href={link}
          scroll={false}
          role="tab"
          aria-selected={view === k}
          className={clsx(
            "-mb-0.5 flex min-h-11 items-center border-b-2 px-3 no-underline",
            view === k ? "border-accent font-extrabold text-text hover:text-text" : "border-transparent text-neutral-700 hover:text-text",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

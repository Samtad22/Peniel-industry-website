// Upload rules (CLAUDE.md rule 6): PDF, JPG, PNG, XLSX, DOCX, max 20 MB.
// Shared by the browser (to fail fast) and the server; Storage and the
// database enforce the same limits.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  xlsx: XLSX,
  docx: DOCX,
};

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.docx";

/** Artwork and proofs also take designers' source files (Illustrator, EPS). */
const ARTWORK_EXT: Record<string, string> = { ai: "application/postscript", eps: "application/postscript" };
export const ARTWORK_ACCEPT = `${ACCEPT},.ai,.eps`;

export type UploadKind = "document" | "artwork";

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";

export type AttachmentType = "purchase_order" | "specification" | "other";

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  purchase_order: "Purchase order",
  specification: "Specification",
  other: "Other",
};

/** `PDF`, `XLSX`… from a file name. */
export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toUpperCase().replace("JPEG", "JPG") : "FILE";
}

/**
 * The MIME type to store, taken from the extension: browsers report XLSX and
 * DOCX inconsistently (sometimes as an empty string).
 */
export function mimeFor(name: string): string | null {
  const ext = extOf(name);
  return BY_EXT[ext] ?? ARTWORK_EXT[ext] ?? null;
}

/** `3.8 MB`, `38 KB`. */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Why a file can't be uploaded, or null when it can. */
export function fileProblem(file: { name: string; size: number }, kind: UploadKind = "document"): string | null {
  const ext = extOf(file.name);
  if (!BY_EXT[ext] && !(kind === "artwork" && ARTWORK_EXT[ext])) {
    return kind === "artwork" ? "Only PDF, AI, EPS, JPG, PNG, XLSX or DOCX files can be attached" : "Only PDF, JPG, PNG, XLSX or DOCX files can be attached";
  }
  if (file.size > MAX_FILE_BYTES) return `File too large (${formatBytes(file.size)} > 20 MB)`;
  if (file.size === 0) return "The file is empty";
  return null;
}

/** A Storage-safe version of a file name, keeping its extension. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120);
  return cleaned || "file";
}

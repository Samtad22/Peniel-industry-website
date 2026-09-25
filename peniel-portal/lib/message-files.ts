// Files attached to a message: the rules shared by the browser and the
// server actions. The database checks the same things again.
import { fileProblem, mimeFor } from "./files.ts";

export const MAX_MESSAGE_FILES = 5;

/** A file already uploaded to `message-attachments/{company_id}/…`. */
export type MessageFile = { path: string; name: string; size: number; mime: string | null };

/** What a message shows for one of its files. */
export type MessageAttachment = {
  id: string;
  message_id: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
};

/**
 * Read the `attachments` form field. Returns the files, or a message for the
 * person when something is wrong.
 */
export function parseMessageFiles(raw: FormDataEntryValue | null, companyId: string): MessageFile[] | { error: string } {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(String(raw));
  } catch {
    return { error: "Attach the files again." };
  }
  if (!Array.isArray(list)) return { error: "Attach the files again." };
  if (list.length > MAX_MESSAGE_FILES) return { error: `Attach up to ${MAX_MESSAGE_FILES} files.` };
  const files: MessageFile[] = [];
  for (const f of list as Record<string, unknown>[]) {
    const path = String(f?.path ?? "");
    const name = String(f?.name ?? "").trim().slice(0, 200);
    const size = Number(f?.size);
    if (!path.startsWith(`${companyId}/`) || path.includes("..")) return { error: "Attach the files again." };
    const problem = fileProblem({ name, size });
    if (problem) return { error: `${name}: ${problem}` };
    files.push({ path, name, size, mime: mimeFor(name) });
  }
  return files;
}

/** A message needs text; a files-only message says what was attached. */
export function messageBody(body: string, files: MessageFile[]): string {
  if (body) return body;
  if (!files.length) return "";
  return `Attached: ${files.map((f) => f.name).join(", ")}`;
}

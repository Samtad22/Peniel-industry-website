// Browser-only: upload a file straight to a private Storage bucket with
// progress. Storage policies decide where the signed-in user may write.
import { mimeFor, safeFileName } from "@/lib/files";
import type { MessageFile } from "@/lib/message-files";
import { createClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export type Bucket = "order-attachments" | "documents" | "proofs" | "artwork" | "crowns" | "message-attachments";

export async function uploadToStorage(
  bucket: Bucket,
  file: File,
  path: string,
  onProgress: (pct: number) => void = () => {},
): Promise<void> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Log in again, then retry.");

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl()}/storage/v1/object/${bucket}/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", supabaseAnonKey());
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", mimeFor(file.name) ?? "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              xhr.status === 413
                ? "File too large (limit 20 MB)"
                : xhr.status === 403
                  ? "You don't have permission to upload here."
                  : "Upload failed. Check your connection and retry.",
            ),
          );
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and retry."));
    xhr.send(file);
  });
}

/**
 * Upload the files chosen for a message into the conversation's company
 * folder. Files already uploaded by an earlier attempt (kept in `done`) are
 * not sent again.
 */
export async function uploadMessageFiles(
  companyId: string,
  files: File[],
  done: Map<File, MessageFile>,
  onProgress: (pct: number) => void = () => {},
): Promise<MessageFile[]> {
  const out: MessageFile[] = [];
  for (const [i, file] of files.entries()) {
    let up = done.get(file);
    if (!up) {
      const path = `${companyId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
      await uploadToStorage("message-attachments", file, path, (p) => onProgress(Math.round(((i + p / 100) / files.length) * 100)));
      up = { path, name: file.name, size: file.size, mime: mimeFor(file.name) };
      done.set(file, up);
    }
    out.push(up);
  }
  return out;
}

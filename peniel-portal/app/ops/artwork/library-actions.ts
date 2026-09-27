"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { LIBRARY_FOLDER, type LibraryKind } from "@/lib/artwork-library";
import { fileProblem } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export type LibraryState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/** Designs: admin and sales. Print layouts: admin only (RLS and storage enforce the same). */
const WRITERS: Record<LibraryKind, ("admin" | "sales")[]> = { design: ["admin", "sales"], print_layout: ["admin"] };

export type LibraryUpload = { path: string; name: string; size: number };

/** Record files already uploaded to `artwork-library/{company_id}/{design|print-layout}/…` against a brand. */
export async function addLibraryFiles(input: {
  kind: LibraryKind;
  brandId: string;
  files: LibraryUpload[];
  title: string;
  notes: string;
  ups: number | null;
}): Promise<LibraryState> {
  if (!(input.kind in WRITERS)) return { error: "Choose the section." };
  await requireStaff(WRITERS[input.kind]);
  if (!UUID.test(input.brandId)) return { error: "Choose the brand." };
  if (input.files.length === 0 || input.files.length > 50) return { error: "Choose between 1 and 50 files." };
  for (const f of input.files) {
    const problem = fileProblem({ name: f.name, size: f.size }, "library");
    if (problem) return { error: `${f.name}: ${problem}` };
    if (!f.path.split("/")[1] || f.path.split("/")[1] !== LIBRARY_FOLDER[input.kind]) return { error: "Something went wrong. Please try again." };
  }
  const ups = input.kind === "print_layout" ? (input.ups && input.ups > 0 && input.ups <= 5000 ? Math.round(input.ups) : null) : null;
  if (input.kind === "print_layout" && !ups) return { error: "Enter the crowns on the sheet (usually 702)." };

  const supabase = await createClient();
  const { error } = await supabase.from("brand_artwork_files").insert(
    input.files.map((f) => ({
      brand_id: input.brandId,
      kind: input.kind,
      title: input.files.length === 1 ? input.title.trim().slice(0, 200) || null : null,
      file_path: f.path,
      file_name: f.name.slice(0, 255),
      size_bytes: f.size,
      ups,
      notes: input.notes.trim().slice(0, 1000) || null,
    })),
  );
  if (error) {
    if (/row-level|permission/i.test(error.message)) return { error: "Your role can't add files here." };
    return { error: "Couldn't save the files. Please try again." };
  }
  revalidatePath("/ops/artwork");
  const n = input.files.length;
  return { ok: `${n} ${n === 1 ? "file" : "files"} added.` };
}

/** Remove a file from the library (the record and the stored file). */
export async function deleteLibraryFile(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  // RLS decides: sales can't see or remove print layouts.
  const { data } = await supabase.from("brand_artwork_files").delete().eq("id", id).select("file_path").maybeSingle<{ file_path: string }>();
  if (data) await supabase.storage.from("artwork-library").remove([data.file_path]);
  revalidatePath("/ops/artwork");
}

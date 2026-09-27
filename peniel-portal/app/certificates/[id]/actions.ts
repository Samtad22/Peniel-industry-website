"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { isSignatureImage, MAX_SIGNATURE_CHARS, SIGNATURE_LINES, type SignatureLine } from "@/lib/signatures";
import { notifyCertificateReady } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

export type SignState = { error?: string; ok?: string } | null;

/** The quality manager (role quality) signs; admin can remove a signature (RLS enforces the same). */
const SIGNERS = ["quality"] as const;
const REMOVERS = ["admin", "quality"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const LINES = SIGNATURE_LINES;
type Line = SignatureLine;

function refresh(id: string) {
  revalidatePath(`/certificates/${id}`);
  revalidatePath("/ops/quality", "layout");
}

/** Sign a batch's Certificate of Analysis ("Prepared by"), as yourself: drawn now, or your saved signature. */
export async function signCertificate(_prev: SignState, fd: FormData): Promise<SignState> {
  const me = await requireStaff([...SIGNERS]);
  const id = String(fd.get("inspection_id") ?? "");
  const line = String(fd.get("line") ?? "") as Line;
  if (!UUID.test(id) || !(line in LINES)) return { error: "Something went wrong. Reload the page and try again." };

  const supabase = await createClient();
  let image = String(fd.get("image") ?? "");
  if (fd.get("use_saved") === "on") {
    const { data } = await supabase.from("staff_signatures").select("image").eq("user_id", me.user_id).maybeSingle<{ image: string }>();
    if (!data) return { error: "You have no saved signature yet. Draw it instead." };
    image = data.image;
  }
  if (!image) return { error: "Draw your signature in the box first." };
  if (image.length > MAX_SIGNATURE_CHARS) return { error: "That signature is too detailed to store. Clear it and sign again, more simply." };
  if (!isSignatureImage(image)) return { error: "That signature couldn't be read. Clear it and draw it again." };

  if (fd.get("save") === "on" && fd.get("use_saved") !== "on") {
    const { error } = await supabase.from("staff_signatures").upsert({ user_id: me.user_id, image, updated_at: new Date().toISOString() });
    if (error) return { error: "Couldn't save your signature for next time. Please try again." };
  }

  const { error } = await supabase.from("coa_signatures").insert({ inspection_id: id, line, image });
  if (error) {
    // The database's own messages (23514) are written for staff; pass them on.
    if (error.code === "23514" && !/violates check constraint/.test(error.message)) return { error: error.message };
    if (error.code === "23505") return { error: `"${LINES[line]}" is already signed. Refresh the page.` };
    if (/row-level|permission/i.test(error.message)) return { error: "Your role can't sign certificates." };
    return { error: "Couldn't sign the certificate. Please try again." };
  }

  // Released and published already: the customer hears it's ready.
  notifyCertificateReady(id);
  refresh(id);
  return { ok: "Signed. The customer can open the certificate once the batch is released and published." };
}

/** Take the signature off (your own; admin can remove any). */
export async function removeSignature(fd: FormData): Promise<void> {
  await requireStaff([...REMOVERS]);
  const id = String(fd.get("inspection_id") ?? "");
  const line = String(fd.get("line") ?? "");
  if (!UUID.test(id) || !(line in LINES)) return;
  const supabase = await createClient();
  await supabase.from("coa_signatures").delete().eq("inspection_id", id).eq("line", line);
  refresh(id);
}

/** Forget your saved signature. */
export async function forgetSavedSignature(fd: FormData): Promise<void> {
  const me = await requireStaff([...SIGNERS]);
  const supabase = await createClient();
  await supabase.from("staff_signatures").delete().eq("user_id", me.user_id);
  const id = String(fd.get("inspection_id") ?? "");
  if (UUID.test(id)) refresh(id);
}

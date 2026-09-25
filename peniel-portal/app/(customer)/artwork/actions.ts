"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fileProblem, mimeFor } from "@/lib/files";
import { notifyArtworkSubmitted, notifyProofAnswered } from "@/lib/notify";

export type ProofState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/** Approve a proof, or request changes with a comment (customer_respond_to_proof checks it is yours). */
export async function respondToProof(_prev: ProofState, fd: FormData): Promise<ProofState> {
  await requireCustomer();
  const proofId = String(fd.get("proof_id") ?? "");
  const approve = fd.get("decision") === "approve";
  const comment = String(fd.get("comment") ?? "").trim();
  if (!approve && !comment) return { error: "Tell Peniel what to change." };
  if (comment.length > 2000) return { error: "Please keep comments under 2,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_respond_to_proof", { p_proof_id: proofId, p_approve: approve, p_comment: comment || null });
  if (error) {
    return { error: /already been answered/.test(error.message) ? "This proof has already been answered." : "We couldn't send your answer. Please try again." };
  }
  revalidatePath("/artwork");
  revalidatePath("/orders");
  notifyProofAnswered(proofId);
  return { ok: approve ? "Approved. Peniel will schedule production." : "Sent. Peniel will send a new proof." };
}

/** Send artwork (already uploaded to artwork/{company}/submissions/…) to Peniel for review. */
export async function submitArtwork(input: {
  title: string;
  note: string;
  brandId: string;
  orderId: string;
  path: string;
  name: string;
  size: number;
}): Promise<ProofState> {
  const me = await requireCustomer();
  const title = input.title.trim();
  if (!title) return { error: "Give the artwork a short title, e.g. “Negus 2027 label”." };
  if (title.length > 150 || input.note.length > 2000) return { error: "That's too long. Please shorten the title or note." };
  const problem = fileProblem({ name: input.name, size: input.size }, "artwork");
  if (problem) return { error: problem };
  if (!input.path.startsWith(`${me.company_id}/submissions/`)) return { error: "Upload the file again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_submit_artwork", {
    p_title: title,
    p_path: input.path,
    p_name: input.name,
    p_size: input.size,
    p_mime: mimeFor(input.name),
    p_brand_id: UUID.test(input.brandId) ? input.brandId : null,
    p_order_id: UUID.test(input.orderId) ? input.orderId : null,
    p_note: input.note.trim() || null,
  });
  if (error || !data) {
    console.error("customer_submit_artwork failed", error?.code, error?.message);
    return { error: "We couldn't send your artwork. Please try again." };
  }
  revalidatePath("/artwork");
  notifyArtworkSubmitted(data as string);
  return { ok: "Sent. Peniel will review it and reply here." };
}

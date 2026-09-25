"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyProofAnswered } from "@/lib/notify";

export type ProofState = { error?: string; ok?: string } | null;

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

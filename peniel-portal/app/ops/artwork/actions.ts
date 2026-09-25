"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { fileProblem, mimeFor, safeFileName } from "@/lib/files";
import type { OrderStatus } from "@/lib/order-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyProofSent } from "@/lib/notify";

export type ArtworkState = { error?: string; ok?: string } | null;

/** Only admin and sales send proofs and lock artwork (RLS enforces the same). */
const EDITORS = ["admin", "sales"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
/** Order statuses that move to "Awaiting approval" when a proof is sent for them. */
const TO_AWAITING: OrderStatus[] = ["confirmed", "scheduled"];

function refresh() {
  revalidatePath("/ops/artwork");
  revalidatePath("/ops", "layout");
  revalidatePath("/artwork");
  revalidatePath("/orders");
}

export async function sendProof(input: {
  brandId: string;
  orderId: string;
  path: string;
  name: string;
  size: number;
  note: string;
  approveBy: string;
  setAwaiting: boolean;
}): Promise<ArtworkState> {
  const me = await requireStaff([...EDITORS]);
  if (!UUID.test(input.brandId)) return { error: "Choose the brand." };
  const problem = fileProblem(input);
  if (problem) return { error: problem };
  if (input.note.length > 1000) return { error: "Keep the note under 1,000 characters." };
  if (input.approveBy && !/^\d{4}-\d{2}-\d{2}$/.test(input.approveBy)) return { error: "Check the approve-by date." };

  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("company_id").eq("id", input.brandId).maybeSingle<{ company_id: string }>();
  if (!brand) return { error: "Brand not found." };
  if (!input.path.startsWith(`${brand.company_id}/proofs/`) || input.path.includes("..")) return { error: "Upload the file again." };

  let order: { id: string; status: OrderStatus } | null = null;
  if (UUID.test(input.orderId)) {
    const { data: o } = await supabase
      .from("orders")
      .select("id, status, brand_id")
      .eq("id", input.orderId)
      .maybeSingle<{ id: string; status: OrderStatus; brand_id: string }>();
    if (!o || o.brand_id !== input.brandId) return { error: "That order is for a different brand." };
    order = o;
  }

  const { data: proof, error } = await supabase.from("proofs").insert({
    brand_id: input.brandId,
    order_id: order?.id ?? null,
    file_path: input.path,
    file_name: input.name,
    size_bytes: input.size,
    mime_type: mimeFor(input.name),
    note: input.note.trim() || null,
    approve_by: input.approveBy || null,
    sent_by: me.user_id,
  }).select("id").single<{ id: string }>();
  if (error || !proof) return { error: /row-level|permission/i.test(error.message) ? "Your role can't send proofs." : "Couldn't send the proof." };

  if (order && input.setAwaiting && TO_AWAITING.includes(order.status)) {
    await supabase.from("orders").update({ status: "awaiting_approval", customer_reason: null }).eq("id", order.id);
  }
  refresh();
  notifyProofSent(proof.id);
  return { ok: "Proof sent. The customer sees it under Artwork and on the order." };
}

/**
 * Make an approved proof the brand's current artwork: copy the file into the
 * artwork bucket, add the next artwork version, and point the brand at it.
 */
export async function lockArtwork(fd: FormData): Promise<void> {
  await requireStaff([...EDITORS]);
  const proofId = String(fd.get("proof_id") ?? "");
  if (!UUID.test(proofId)) return;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("proofs")
    .select("id, brand_id, file_path, file_name, status, responded_at, responded_by, brands(company_id)")
    .eq("id", proofId)
    .maybeSingle<{
      id: string;
      brand_id: string;
      file_path: string;
      file_name: string | null;
      status: string;
      responded_at: string | null;
      responded_by: string | null;
      brands: { company_id: string } | null;
    }>();
  if (!p || p.status !== "approved" || !p.brands) return;

  // The service role only moves the file; the records are written as this user (RLS, audit).
  const admin = createAdminClient();
  const { data: blob } = await admin.storage.from("proofs").download(p.file_path);
  if (!blob) return;
  const name = safeFileName(p.file_name ?? p.file_path.split("/").pop() ?? "artwork.pdf");
  const path = `${p.brands.company_id}/artwork/${crypto.randomUUID()}/${name}`;
  const { error: upErr } = await admin.storage.from("artwork").upload(path, blob, { contentType: mimeFor(name) ?? undefined });
  if (upErr) return;

  const { data: last } = await supabase
    .from("artwork_versions")
    .select("version")
    .eq("brand_id", p.brand_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  const { data: v } = await supabase
    .from("artwork_versions")
    .insert({
      brand_id: p.brand_id,
      version: (last?.version ?? 0) + 1,
      file_path: path,
      approved_at: p.responded_at ?? new Date().toISOString(),
      approved_by: p.responded_by,
    })
    .select("id")
    .single<{ id: string }>();
  if (v) await supabase.from("brands").update({ current_artwork_version_id: v.id }).eq("id", p.brand_id);
  refresh();
}

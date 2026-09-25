"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { fileProblem, mimeFor, safeFileName } from "@/lib/files";
import type { OrderStatus } from "@/lib/order-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyProofDispatched, notifyProofSent, notifySubmissionReviewed } from "@/lib/notify";
import type { PhysicalDelivery } from "@/lib/proofs";

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

export type DeliveryInput = {
  /** "" = digital only, through the portal. */
  method: "" | PhysicalDelivery;
  courier: string;
  tracking: string;
  driver: string;
  vehicle: string;
};

/** Physical delivery columns for a proof, or an error message. */
function deliveryColumns(d: DeliveryInput): Record<string, string | null> | { error: string } {
  if (!d.method) return {};
  if (d.method === "courier") {
    const courier = d.courier.trim().slice(0, 60) || "DHL";
    const tracking = d.tracking.replace(/\s+/g, "").slice(0, 60);
    return { physical_delivery: "courier", courier, tracking_number: tracking || null, delivery_driver: null, delivery_vehicle: null, dispatched_at: new Date().toISOString() };
  }
  if (d.method === "peniel_driver") {
    if (!d.driver.trim()) return { error: "Enter the driver's name (internal only)." };
    return {
      physical_delivery: "peniel_driver",
      courier: null,
      tracking_number: null,
      delivery_driver: d.driver.trim().slice(0, 100),
      delivery_vehicle: d.vehicle.trim().slice(0, 40) || null,
      dispatched_at: new Date().toISOString(),
    };
  }
  return { error: "Choose how the proof is delivered." };
}

export async function sendProof(input: {
  brandId: string;
  orderId: string;
  /** Empty for a physical-only proof. */
  path: string;
  name: string;
  size: number;
  note: string;
  approveBy: string;
  setAwaiting: boolean;
  delivery: DeliveryInput;
}): Promise<ArtworkState> {
  const me = await requireStaff([...EDITORS]);
  if (!UUID.test(input.brandId)) return { error: "Choose the brand." };
  const hasFile = Boolean(input.path);
  if (!hasFile && !input.delivery.method) return { error: "Attach the proof file, or choose a courier or driver for a physical proof." };
  const problem = hasFile ? fileProblem(input) : null;
  if (problem) return { error: problem };
  const delivery = deliveryColumns(input.delivery);
  if ("error" in delivery) return { error: String(delivery.error) };
  if (input.note.length > 1000) return { error: "Keep the note under 1,000 characters." };
  if (input.approveBy && !/^\d{4}-\d{2}-\d{2}$/.test(input.approveBy)) return { error: "Check the approve-by date." };

  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("company_id").eq("id", input.brandId).maybeSingle<{ company_id: string }>();
  if (!brand) return { error: "Brand not found." };
  if (hasFile && (!input.path.startsWith(`${brand.company_id}/proofs/`) || input.path.includes(".."))) return { error: "Upload the file again." };

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
    file_path: hasFile ? input.path : null,
    file_name: hasFile ? input.name : null,
    size_bytes: hasFile ? input.size : null,
    mime_type: hasFile ? mimeFor(input.name) : null,
    note: input.note.trim() || null,
    approve_by: input.approveBy || null,
    sent_by: me.user_id,
    ...delivery,
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
      file_path: string | null;
      file_name: string | null;
      status: string;
      responded_at: string | null;
      responded_by: string | null;
      brands: { company_id: string } | null;
    }>();
  if (!p || p.status !== "approved" || !p.brands || !p.file_path) return;

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

/** Record (or correct) how a proof was physically sent: courier + tracking, or a Peniel driver. */
export async function recordProofDispatch(_prev: ArtworkState, fd: FormData): Promise<ArtworkState> {
  await requireStaff([...EDITORS]);
  const proofId = String(fd.get("proof_id") ?? "");
  if (!UUID.test(proofId)) return { error: "Proof not found." };
  const delivery = deliveryColumns({
    method: String(fd.get("method") ?? "") as DeliveryInput["method"],
    courier: String(fd.get("courier") ?? ""),
    tracking: String(fd.get("tracking") ?? ""),
    driver: String(fd.get("driver") ?? ""),
    vehicle: String(fd.get("vehicle") ?? ""),
  });
  if ("error" in delivery) return { error: String(delivery.error) };
  if (!Object.keys(delivery).length) return { error: "Choose a courier or a Peniel driver." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("proofs").update(delivery).eq("id", proofId).select("id");
  if (error || !data?.length) return { error: "Couldn't save the delivery details." };
  refresh();
  notifyProofDispatched(proofId);
  return { ok: delivery.physical_delivery === "courier" ? "Saved. The customer sees the tracking number." : "Saved. The customer sees it was delivered by Peniel." };
}

/** Answer artwork a customer sent: accept it, or ask for changes (the comment is shown to the customer). */
export async function reviewSubmission(_prev: ArtworkState, fd: FormData): Promise<ArtworkState> {
  const me = await requireStaff([...EDITORS]);
  const id = String(fd.get("submission_id") ?? "");
  const accept = fd.get("decision") === "accept";
  const comment = String(fd.get("comment") ?? "").trim();
  if (!UUID.test(id)) return { error: "Artwork not found." };
  if (!accept && !comment) return { error: "Tell the customer what to change." };
  if (comment.length > 2000) return { error: "Keep the comment under 2,000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artwork_submissions")
    .update({
      status: accept ? "accepted" : "changes_requested",
      staff_comment: comment || null,
      reviewed_by: me.user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't save your answer." };
  refresh();
  notifySubmissionReviewed(id);
  return { ok: accept ? "Accepted. The customer has been told." : "Sent. The customer sees your comment." };
}

/** Make an accepted customer file the brand's approved artwork (next version). */
export async function lockSubmission(fd: FormData): Promise<void> {
  await requireStaff([...EDITORS]);
  const id = String(fd.get("submission_id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("artwork_submissions")
    .select("id, brand_id, file_path, status, reviewed_at, artwork_version_id, submitted_by")
    .eq("id", id)
    .maybeSingle<{ id: string; brand_id: string | null; file_path: string; status: string; reviewed_at: string | null; artwork_version_id: string | null; submitted_by: string | null }>();
  if (!s || s.status !== "accepted" || !s.brand_id || s.artwork_version_id) return;

  const { data: last } = await supabase
    .from("artwork_versions")
    .select("version")
    .eq("brand_id", s.brand_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  const { data: v } = await supabase
    .from("artwork_versions")
    .insert({
      brand_id: s.brand_id,
      version: (last?.version ?? 0) + 1,
      file_path: s.file_path, // already in the artwork bucket
      approved_at: s.reviewed_at ?? new Date().toISOString(),
      approved_by: s.submitted_by,
    })
    .select("id")
    .single<{ id: string }>();
  if (!v) return;
  await supabase.from("brands").update({ current_artwork_version_id: v.id }).eq("id", s.brand_id);
  await supabase.from("artwork_submissions").update({ artwork_version_id: v.id }).eq("id", s.id);
  refresh();
}

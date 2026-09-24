"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { MEASURES } from "@/lib/qc";
import { createClient } from "@/lib/supabase/server";

export type QcState = { error?: string } | null;

/** Only admin and quality record inspections (RLS and the RPC enforce the same). */
const WRITERS = ["admin", "quality"] as const;

const KNOWN = /Enter the batch number|Enter the sample size|Choose the order|More defects than crowns|whole numbers/;

function refresh() {
  revalidatePath("/ops/quality", "layout");
  revalidatePath("/ops", "layout");
}

export async function saveInspection(_prev: QcState, fd: FormData): Promise<QcState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();

  const measurements: Record<string, number> = {};
  for (const m of MEASURES) {
    const raw = s(`m_${m.key}`);
    if (!raw) continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return { error: `${m.label}: enter a number.` };
    measurements[m.key] = n;
  }
  const defects: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("d_")) continue;
    const n = Number(String(v).replace(/[,\s]/g, "") || 0);
    if (!Number.isInteger(n) || n < 0) return { error: "Defect counts must be whole numbers." };
    if (n > 0) defects[k.slice(2)] = n;
  }

  const result = s("result");
  const reason = s("customer_reason");
  if (!["", "released", "on_hold"].includes(result)) return { error: "Choose the release decision." };
  if (result === "on_hold" && !reason) return { error: "Write the reason the customer will see for the hold." };
  if (reason.length > 1000) return { error: "Keep the customer reason under 1,000 characters." };

  // <input type="datetime-local"> has no zone; the lab works in Addis Ababa time.
  const at = s("inspected_at");
  const inspectedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? `${at}:00+03:00` : "";

  const sample = Number(s("sample_size").replace(/[,\s]/g, ""));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("qc_save_inspection", {
    p: {
      id: s("id") || null,
      batch_no: s("batch_no"),
      order_id: s("order_id") || null,
      inspected_at: inspectedAt,
      sample_size: Number.isInteger(sample) ? sample : null,
      measurements,
      defects,
      result,
      customer_reason: result === "on_hold" ? reason : reason || "",
      internal_notes: s("internal_notes"),
      published: fd.get("published") === "on",
    },
  });

  if (error || !data) {
    const msg = error?.message ?? "";
    if (/qc_inspections_batch_no_key|duplicate key/.test(msg)) return { error: "That batch number already exists." };
    if (/qc_hold_needs_customer_reason/.test(msg)) return { error: "Write the reason the customer will see for the hold." };
    if (KNOWN.test(msg)) return { error: msg };
    if (/permitted|row-level/i.test(msg)) return { error: "Your role can't record inspections." };
    return { error: "Couldn't save the inspection. Please try again." };
  }

  refresh();
  redirect(`/ops/quality?saved=${encodeURIComponent(s("batch_no"))}`);
}

export async function setInspectionPublished(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("qc_inspections").update({ published: fd.get("published") === "true" }).eq("id", id);
  refresh();
}

import type { Metadata } from "next";
import InboxView, { type InboxRow } from "@/components/ops/InboxView";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { loadPresets } from "@/lib/presets";
import { opsRolesFor } from "@/lib/roles";
import { loadStaffOrder } from "@/lib/staff-orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order inbox" };

type Row = {
  id: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  created_at: string;
  companies: { name: string } | null;
  brands: { name: string; size: string; finish: string | null } | null;
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  await requireStaff(opsRolesFor("inbox"));
  const { o } = await searchParams;
  const supabase = await createClient();

  const [{ data }, presets] = await Promise.all([
    supabase
      .from("orders")
      .select("id, po_number, quantity, requested_date, created_at, companies(name), brands(name, size, finish)")
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    loadPresets(supabase),
  ]);

  const rows: InboxRow[] = (data ?? []).map((r) => ({
    id: r.id,
    company: r.companies?.name ?? "—",
    brand: r.brands?.name ?? "—",
    spec: [r.brands?.size, r.brands?.finish].filter(Boolean).join(" · "),
    po_number: r.po_number,
    quantity: Number(r.quantity),
    requested_date: r.requested_date,
    created_at: r.created_at,
  }));

  const selectedId = rows.find((r) => r.id === o)?.id ?? rows[0]?.id;
  const selected = selectedId ? await loadStaffOrder(supabase, selectedId) : null;

  return (
    <InboxView
      rows={rows}
      selected={selected}
      rejectPresets={presets.reject}
      minDate={addisDateISO(new Date())}
      now={new Date().toISOString()}
    />
  );
}

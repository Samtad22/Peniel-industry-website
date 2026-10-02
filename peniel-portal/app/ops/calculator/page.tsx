import type { Metadata } from "next";
import CalculatorView, { type CalcBrand, type CalcMaterial } from "@/components/ops/CalculatorView";
import OpsHeader from "@/components/ops/OpsHeader";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { brandInks, type InkRate } from "@/lib/ink-usage";
import { opsRolesFor } from "@/lib/roles";
import { getSettings } from "@/lib/settings-server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calculator" };

type Row = { id: string; name: string; unit: string; on_hand: number; use_basis: string | null; use_rate: number | null; active: boolean; ink_name: string | null };

/**
 * Calculator (admin only): tonnes to kg, what stillages and materials make
 * (crowns, sheets, press time), and what an amount of crowns consumes, from
 * the plant settings and the usage rates set in Inventory. Nothing is saved.
 */
export default async function CalculatorPage() {
  await requireStaff(opsRolesFor("calculator"));
  const plant = (await getSettings()).plant;
  const supabase = await createClient();
  const [{ data: mats }, { data: brandData }, { data: rates }] = await Promise.all([
    supabase.from("raw_materials").select("id, name, unit, on_hand, use_basis, use_rate, active, ink_name").eq("active", true).order("name").returns<Row[]>(),
    supabase.from("brands").select("id, name, colours, companies(name)").eq("active", true).order("name").returns<{ id: string; name: string; colours: string[]; companies: { name: string } | null }[]>(),
    supabase.from("brand_ink_rates").select("brand_id, material_id, g_per_sheet").returns<InkRate[]>(),
  ]);
  const rows = mats ?? [];
  const inks = rows.filter((m) => m.ink_name).map((m) => ({ id: m.id, ink_name: m.ink_name!, active: m.active }));
  const materials: CalcMaterial[] = rows
    .filter((m) => !m.ink_name)
    .map((m) => ({ id: m.id, name: m.name, unit: m.unit, onHand: Number(m.on_hand), basis: m.use_basis, rate: m.use_rate == null ? null : Number(m.use_rate) }));
  const brands: CalcBrand[] = (brandData ?? []).map((b) => ({
    id: b.id,
    label: `${b.name} · ${(b.companies?.name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "")}`,
    inks: brandInks(b.colours, b.id, inks, rates ?? []).map((i) => ({ ...i, onHandKg: Number(rows.find((m) => m.id === i.materialId)?.on_hand ?? 0) })),
  }));

  return (
    <>
      <OpsHeader
        title="Calculator"
        sub="Tonnes to kg, what stillages and materials make, and what an order consumes. From the plant settings and the usage rates in Inventory. Nothing is saved."
        actions={<InternalOnly>Admin only</InternalOnly>}
      />
      <CalculatorView
        plant={{ stillage_sheets: plant.stillage_sheets, press_per_hour: plant.press_per_hour, shift_hours: plant.shift_hours }}
        materials={materials}
        brands={brands}
      />
    </>
  );
}

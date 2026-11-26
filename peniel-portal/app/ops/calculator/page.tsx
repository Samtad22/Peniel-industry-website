import type { Metadata } from "next";
import CalculatorView, { type CalcBrand, type CalcMaterial } from "@/components/ops/CalculatorView";
import OpsHeader from "@/components/ops/OpsHeader";
import ShipmentPlan, { type PlanInk } from "@/components/ops/ShipmentPlan";
import { addisDateISO } from "@/lib/format";
import { inkPerSheet, inkPerSheetFromRates } from "@/lib/order-plan";
import { coatShareFrom } from "@/lib/stock-capacity";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { brandInks, type InkRate } from "@/lib/ink-usage";
import { opsRolesFor } from "@/lib/roles";
import { getSettings } from "@/lib/settings-server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calculator" };

type Row = { id: string; name: string; unit: string; on_hand: number; use_basis: string | null; use_rate: number | null; active: boolean; ink_name: string | null; part_no: string | null };
type InkRun = { sheets_printed: number; sheets_spoiled: number; inks: Record<string, number> | null };

/**
 * Calculator (admin only): tonnes to kg, what stillages and materials make
 * (crowns, sheets, press time), and what an amount of crowns consumes, from
 * the plant settings and the usage rates set in Inventory. Nothing is saved.
 */
export default async function CalculatorPage() {
  await requireStaff(opsRolesFor("calculator"));
  const plant = (await getSettings()).plant;
  const supabase = await createClient();
  const since90 = addisDateISO(new Date(), -90);
  const since60 = addisDateISO(new Date(), -60);
  const [{ data: mats }, { data: brandData }, { data: rates }, { data: inkRuns }, { data: inkSamples }, { data: coated }] = await Promise.all([
    supabase.from("raw_materials").select("id, name, unit, on_hand, use_basis, use_rate, active, ink_name, part_no").eq("active", true).order("name").returns<Row[]>(),
    supabase.from("brands").select("id, name, colours, base_coat, companies(name)").eq("active", true).order("name").returns<{ id: string; name: string; colours: string[]; base_coat: "white" | "transparent" | null; companies: { name: string } | null }[]>(),
    supabase.from("brand_ink_rates").select("brand_id, material_id, g_per_sheet").returns<InkRate[]>(),
    // Ink used on printed stillages and sample sheets over the last 90 days: the grams a sheet takes.
    supabase.from("print_runs").select("sheets_printed, sheets_spoiled, inks").eq("printed", true).gte("run_date", since90).returns<InkRun[]>(),
    supabase.from("sample_sheets").select("sheets, inks").gte("sample_date", since90).returns<{ sheets: number; inks: Record<string, number> | null }[]>(),
    // Sheets printed over the last 60 days by brand coat: the white / transparent split to start from.
    supabase
      .from("print_runs")
      .select("sheets_printed, sheets_spoiled, base_sheets, brands(base_coat)")
      .not("brand_id", "is", null)
      .gte("run_date", since60)
      .returns<{ sheets_printed: number; sheets_spoiled: number; base_sheets: number | null; brands: { base_coat: string | null } | null }[]>(),
  ]);
  const rows = mats ?? [];
  const inks = rows.filter((m) => m.ink_name).map((m) => ({ id: m.id, ink_name: m.ink_name!, active: m.active }));
  const materials: CalcMaterial[] = rows
    .filter((m) => !m.ink_name)
    .map((m) => ({ id: m.id, name: m.name, unit: m.unit, onHand: Number(m.on_hand), basis: m.use_basis, rate: m.use_rate == null ? null : Number(m.use_rate) }));
  const brands: CalcBrand[] = (brandData ?? []).map((b) => ({
    id: b.id,
    label: `${b.name} · ${(b.companies?.name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "")}`,
    baseCoat: b.base_coat,
    inks: brandInks(b.colours, b.id, inks, rates ?? []).map((i) => ({ ...i, onHandKg: Number(rows.find((m) => m.id === i.materialId)?.on_hand ?? 0) })),
  }));

  // The next shipment: inks at what printing used per sheet, else an average brand's grams.
  const history = [
    ...(inkRuns ?? []).map((r) => ({ sheets: Number(r.sheets_printed) + Number(r.sheets_spoiled), inks: r.inks })),
    ...(inkSamples ?? []).map((r) => ({ sheets: Number(r.sheets), inks: r.inks })),
  ];
  const fromHistory = inkPerSheet(history);
  const perSheet = fromHistory.size > 0 ? fromHistory : inkPerSheetFromRates(rates ?? []);
  const historySheets = history.reduce((t, r) => t + r.sheets, 0);
  const inkSource =
    fromHistory.size > 0
      ? `Grams a sheet from what printing used over the last 90 days (${historySheets.toLocaleString("en-US")} sheets), for the same mix of brands.`
      : "No ink recorded on printing yet: grams a sheet of an average brand, from the grams per sheet set under Inventory → Ink per sheet.";
  const planInks: PlanInk[] = rows
    .filter((m) => m.ink_name && perSheet.has(m.id))
    .map((m) => ({ id: m.id, name: m.ink_name!, partNo: m.part_no, onHandKg: Number(m.on_hand), gPerSheet: perSheet.get(m.id)! }));
  const share = coatShareFrom((coated ?? []).map((r) => ({ coat: r.brands?.base_coat ?? null, crowns: Number(r.base_sheets ?? Number(r.sheets_printed) + Number(r.sheets_spoiled)) })));
  const coatTotal = share ? share.white + share.transparent : 0;
  const whiteSharePct = share && coatTotal > 0 ? Math.round((share.white / coatTotal) * 100) : 50;

  return (
    <>
      <OpsHeader
        title="Calculator"
        sub="What to order for the next shipment, tonnes to kg, what stillages and materials make, and what an order consumes. From the plant settings and the usage rates in Inventory. Nothing is saved."
        actions={<InternalOnly>Admin only</InternalOnly>}
      />
      <section className="flex flex-col gap-4 border-b-2 border-divider px-4 py-6 sm:px-8">
        <ShipmentPlan
          plant={{ stillage_sheets: plant.stillage_sheets, press_per_hour: plant.press_per_hour, shift_hours: plant.shift_hours }}
          materials={materials}
          inks={planInks}
          inkSource={inkSource}
          whiteSharePct={whiteSharePct}
          whiteShareFrom={share && coatTotal > 0 ? "Starts at the last 60 days of printing" : "No printing in the last 60 days: starts at half"}
        />
      </section>
      <CalculatorView
        plant={{ stillage_sheets: plant.stillage_sheets, press_per_hour: plant.press_per_hour, shift_hours: plant.shift_hours }}
        materials={materials}
        brands={brands}
      />
    </>
  );
}

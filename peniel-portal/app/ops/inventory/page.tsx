import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { InkRatesDialog, MaterialDialog, MaterialSettingsDialog, ReceiveStockDialog, StockCountDialog, StockStatusDialog, type InkRateBrand } from "@/components/ops/InventoryForms";
import { brandInks, formatGrams, formatInkStock, inkByBrand, inkKey, type InkGrams, type InkRate } from "@/lib/ink-usage";
import { parseInk } from "@/lib/inks";
import { Pill } from "@/components/ui/StatusBadge";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { STOCK_PILL, type StockStatus } from "@/lib/inventory";
import { describeUse } from "@/lib/materials";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inventory" };

type Material = { id: string; name: string; unit: string; on_hand: number; reorder_level: number | null; use_basis: string | null; use_rate: number | null; active: boolean; ink_name: string | null };
type InkUse = { inks: InkGrams | null; brands: { name: string } | null };
type Stock = {
  id: string;
  company_id: string;
  batch_no: string;
  quantity: number;
  location: string | null;
  status: StockStatus;
  customer_reason: string | null;
  ready_since: string;
  order_id: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
  orders: { order_no: string } | null;
};

/** Inventory: raw materials (internal) and finished goods by customer and brand (design 1k). */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ v?: string; customer?: string; q?: string }> }) {
  const me = await requireStaff(opsRolesFor("inventory"));
  const sp = await searchParams;
  const view = sp.v === "raw" || sp.v === "finished" ? sp.v : "all";
  const canStock = ["admin", "warehouse", "quality"].includes(me.role);
  const supabase = await createClient();

  const canSetMaterials = me.role === "admin" || me.role === "warehouse";
  const canSetInkRates = canSetMaterials || me.role === "production";
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAgo = `${addDays(todayIso, -7)}T00:00:00+03:00`;
  const monthAgo = addDays(todayIso, -30);
  const [{ data: materials }, { data: stock }, { data: companies }, { data: brands }, { data: orders }, { count: openPickups }, { data: autoUse }, { data: rateData }, { data: runInks }, { data: sampleInks }] = await Promise.all([
    supabase.from("raw_materials").select("id, name, unit, on_hand, reorder_level, use_basis, use_rate, active, ink_name").order("name").returns<Material[]>(),
    supabase
      .from("finished_stock")
      .select("id, company_id, batch_no, quantity, location, status, customer_reason, ready_since, order_id, companies(name), brands(name), orders(order_no)")
      .is("collected_at", null)
      .order("ready_since", { ascending: false })
      .returns<Stock[]>(),
    supabase.from("companies").select("id, name").eq("active", true).order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("brands")
      .select("id, name, company_id, colours, companies(name)")
      .eq("active", true)
      .order("name")
      .returns<{ id: string; name: string; company_id: string; colours: string[]; companies: { name: string } | null }[]>(),
    supabase
      .from("orders")
      .select("id, order_no, company_id, brand_id")
      .not("status", "in", "(delivered,rejected,submitted)")
      .order("order_no", { ascending: false })
      .returns<{ id: string; order_no: string; company_id: string; brand_id: string }[]>(),
    supabase.from("pickup_bookings").select("id", { count: "exact", head: true }).neq("status", "collected"),
    // Material used automatically over the last 7 days.
    supabase.from("raw_material_movements").select("material_id, quantity").eq("source", "auto").gte("created_at", weekAgo).returns<{ material_id: string; quantity: number }[]>(),
    supabase.from("brand_ink_rates").select("brand_id, material_id, g_per_sheet").returns<InkRate[]>(),
    // Ink used over the last 30 days, per brand: printed stillages and sample sheets.
    supabase.from("print_runs").select("inks, brands(name)").gte("run_date", monthAgo).neq("inks", "{}").returns<InkUse[]>(),
    supabase.from("sample_sheets").select("inks, brands(name)").gte("sample_date", monthAgo).neq("inks", "{}").returns<InkUse[]>(),
  ]);
  const onList = (materials ?? []).filter((m) => m.active !== false && !m.ink_name);
  const inks = (materials ?? []).filter((m) => m.active !== false && m.ink_name);
  const offList = (materials ?? []).filter((m) => m.active === false);
  const usedWeek = (id: string) => -(autoUse ?? []).filter((u) => u.material_id === id).reduce((t, u) => t + Number(u.quantity), 0);
  const inkMaterials = (materials ?? []).filter((m) => m.ink_name).map((m) => ({ id: m.id, ink_name: m.ink_name!, active: m.active }));
  const rates = rateData ?? [];
  const rateBrands: InkRateBrand[] = (brands ?? []).map((b) => ({
    id: b.id,
    label: `${b.name} · ${(b.companies?.name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "")}`,
    inks: brandInks(b.colours, b.id, inkMaterials, rates),
  }));
  // Which brands print each ink, at how many grams a sheet.
  const inkBrands = (id: string) => rateBrands.filter((b) => b.inks.some((i) => i.materialId === id)).map((b) => ({ name: b.label.split(" · ")[0], g: b.inks.find((i) => i.materialId === id)!.gPerSheet }));
  const printedBy = inkByBrand((runInks ?? []).map((r) => ({ brand: r.brands?.name ?? "No brand", inks: r.inks })));
  const sampledBy = inkByBrand((sampleInks ?? []).map((r) => ({ brand: r.brands?.name ?? "No brand", inks: r.inks })));
  const inkUseBrands = [...new Set([...printedBy.keys(), ...sampledBy.keys()])].sort();
  const inkLabel = new Map(inkMaterials.map((i) => [i.id, i.ink_name]));
  // The swatch: the hex on a brand's colour, else a known Pantone's.
  const brandHex = new Map<string, string>();
  for (const b of brands ?? []) for (const c of b.colours ?? []) {
    const hex = parseInk(c).hex;
    if (hex && !brandHex.has(inkKey(c))) brandHex.set(inkKey(c), hex);
  }
  const inkHex = (name: string) => brandHex.get(inkKey(name)) ?? parseInk(name).hex;
  const INK_COLS = "grid grid-cols-[minmax(0,1.3fr)_110px_110px_110px_minmax(0,1.6fr)_110px] items-center gap-3";

  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (stock ?? []).filter(
    (s) =>
      (!sp.customer || s.company_id === sp.customer) &&
      (!q || s.batch_no.toLowerCase().includes(q) || (s.orders?.order_no ?? "").toLowerCase().includes(q)),
  );
  const seg = (k: string, label: string) => (
    <Link key={k} href={k === "all" ? "/ops/inventory" : `/ops/inventory?v=${k}`} className={`seg-opt no-underline ${view === k ? "!bg-accent !text-bg" : "text-text"}`}>
      {label}
    </Link>
  );
  const COLS = "grid grid-cols-[minmax(0,1fr)_90px_90px_110px_110px_130px_minmax(0,1.3fr)_50px] items-center gap-2.5";
  // Finished goods by customer (design 2f): one bar per customer, its batches below.
  const groups = [...new Set(rows.map((r) => r.company_id))]
    .map((id) => {
      const mine = rows.filter((r) => r.company_id === id);
      const sum = (st: StockStatus) => mine.filter((r) => r.status === st).reduce((t, r) => t + Number(r.quantity), 0);
      const available = sum("available");
      const reserved = sum("reserved");
      const hold = sum("on_hold");
      return {
        id,
        name: (mine[0].companies?.name ?? "-").replace(/\s+S\.C\.$/, ""),
        brands: [...new Set(mine.map((r) => r.brands?.name ?? "-"))],
        available,
        reserved,
        hold,
        total: available + reserved + hold,
        rows: mine,
      };
    })
    .sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...groups.map((g) => g.total));

  return (
    <>
      <OpsHeader
        title="Inventory"
        sub="Raw materials are internal. Customers only ever see their own finished crowns."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="seg">
              {seg("all", "All")}
              {seg("raw", "Raw material")}
              {seg("finished", "Finished goods")}
            </div>
            <Link href="/ops/inventory/pickups" className="btn btn-secondary text-text">
              Pickups ({openPickups ?? 0}) →
            </Link>
            {canStock && (
              <ReceiveStockDialog
                companies={companies ?? []}
                brands={brands ?? []}
                orders={(orders ?? []).map((o) => ({ id: o.id, name: o.order_no, company_id: o.company_id, brand_id: o.brand_id }))}
              />
            )}
          </div>
        }
      />

      {view !== "finished" && (
        <div className="border-b-2 border-divider">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-8">
            <h2 className="m-0 flex items-center gap-2.5 text-[26px] sm:text-[30px]">
              Raw materials <InternalOnly />
            </h2>
            <div className="flex flex-wrap gap-2">
              {canSetMaterials && <MaterialSettingsDialog />}
              <MaterialDialog materials={[...onList, ...inks].map((m) => ({ id: m.id, name: m.name, unit: m.unit }))} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 border-t-2 border-text xl:grid-cols-3">
            {onList.map((m, i) => {
              const onHand = Number(m.on_hand);
              const reorder = m.reorder_level == null ? null : Number(m.reorder_level);
              const low = reorder != null && onHand <= reorder;
              // The tank is full at three times the reorder level; the dashed line is the reorder level.
              const full = reorder ? reorder * 3 : Math.max(onHand, 1) * 2;
              const pct = Math.min(85, (onHand / full) * 85);
              const line = reorder ? (reorder / full) * 85 : null;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col gap-3 border-divider px-4 pb-6 pt-[22px] sm:px-6 ${i % 2 ? "max-xl:border-l-2" : ""} ${i % 3 ? "xl:border-l-2" : ""} ${i >= 2 ? "max-xl:border-t-2" : ""} ${i >= 3 ? "xl:border-t-2" : ""} ${low ? "bg-accent-100" : ""}`}
                >
                  <h6 className={`m-0 ${low ? "text-accent-800" : ""}`}>{m.name}</h6>
                  <div className="relative h-[160px] border-2 border-text bg-surface sm:h-[220px]">
                    <div className={`absolute inset-x-0 bottom-0 ${low ? "bg-accent" : "bg-text"}`} style={{ height: `${pct}%` }} />
                    {line != null && (
                      <>
                        <div className={`absolute -inset-x-1.5 border-t-2 border-dashed ${low ? "border-text" : "border-accent"}`} style={{ bottom: `${line}%` }} />
                        <span
                          className={`absolute right-1.5 bg-surface px-[3px] font-mono text-[10px] font-semibold ${low ? "text-text" : "text-accent-700"}`}
                          style={{ bottom: `calc(${line}% + 4px)` }}
                        >
                          reorder
                        </span>
                      </>
                    )}
                    <span className={`absolute left-2.5 top-2.5 bg-surface px-1.5 py-1 text-[28px] font-extrabold leading-none tracking-[-.04em] sm:text-[36px] ${low ? "text-accent-800" : "text-text"}`}>
                      {/* Exact below 100,000 so a count can be checked against it. */}
                      {Math.abs(onHand) < 100_000 ? onHand.toLocaleString("en-US", { maximumFractionDigits: 1 }) : formatQty(onHand)}
                      <span className="ml-1 text-[13px] font-normal">{m.unit}</span>
                    </span>
                  </div>
                  <div className={`flex justify-between gap-2 text-[12px] ${low ? "font-extrabold text-accent-800" : ""}`}>
                    <span>{onHand < 0 ? "Below zero: a count is due" : low ? "Below reorder level" : "In stock"}</span>
                    <span>{reorder != null ? `reorder at ${reorder.toLocaleString("en-US")} ${m.unit}` : "no reorder level"}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="opacity-75">
                      {describeUse(m) ? (
                        <>
                          {describeUse(m)}
                          <span className="block">
                            {formatQty(usedWeek(m.id))} {m.unit} used in 7 days
                          </span>
                        </>
                      ) : (
                        "Not tracked automatically"
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {me.role === "admin" && <StockCountDialog id={m.id} name={m.name} unit={m.unit} onHand={onHand} />}
                      {canSetMaterials && (
                        <MaterialSettingsDialog
                          material={{ id: m.id, name: m.name, unit: m.unit, reorder_level: m.reorder_level == null ? null : Number(m.reorder_level), use_basis: m.use_basis, use_rate: m.use_rate == null ? null : Number(m.use_rate), active: true }}
                        />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t-2 border-text px-4 pb-6 pt-5 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-[22px] sm:text-[24px]">Inks</h3>
                <p className="m-0 text-[12px] opacity-70">
                  One stock per Pantone or ink, in kg, shared by every brand that prints it. Each printed stillage and sample takes its ink off by itself.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canSetInkRates && <InkRatesDialog brands={rateBrands.filter((b) => b.inks.length > 0)} />}
                {inks.length > 0 && <MaterialDialog label="Record ink in / out" materials={inks.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))} />}
              </div>
            </div>
            {inks.length === 0 ? (
              <p className="m-0 py-3 text-[13px] opacity-60">No inks yet. They appear here as soon as brands have colours (Customers → a brand → colours).</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className={`${INK_COLS} th-row border-b border-divider py-2`}>
                    <span>Ink</span>
                    <span className="text-right">In stock</span>
                    <span className="text-right">Reorder at</span>
                    <span className="text-right">Used in 7 days</span>
                    <span>Brands · grams per sheet</span>
                    <span />
                  </div>
                  {inks.map((m) => {
                    const onHand = Number(m.on_hand);
                    const reorder = m.reorder_level == null ? null : Number(m.reorder_level);
                    const low = onHand < 0 || (reorder != null && onHand <= reorder);
                    const hex = inkHex(m.ink_name!);
                    const users = inkBrands(m.id);
                    return (
                      <div key={m.id} className={`${INK_COLS} border-b border-divider py-2 text-[13px] ${low ? "bg-accent-100" : ""}`}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block size-4 shrink-0 rounded-full"
                            style={{ background: hex ?? "transparent", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)" }}
                          />
                          <b className="truncate">{m.ink_name}</b>
                        </span>
                        <span className={`text-right tabular-nums ${low ? "font-extrabold text-accent-800" : ""}`}>
                          <b>{formatInkStock(onHand)}</b>
                          {onHand < 0 && <span className="block text-[11px]">a count is due</span>}
                        </span>
                        <span className="text-right tabular-nums opacity-80">{reorder != null ? formatInkStock(reorder) : "-"}</span>
                        <span className="text-right tabular-nums">{usedWeek(m.id) > 0 ? formatInkStock(usedWeek(m.id)) : "-"}</span>
                        <span className="min-w-0 truncate text-[12px]" title={users.map((u) => `${u.name}${u.g ? ` ${u.g} g` : ""}`).join(" · ")}>
                          {users.length === 0
                            ? <span className="opacity-60">no brand now</span>
                            : users.map((u, i) => (
                                <span key={u.name}>
                                  {i > 0 && " · "}
                                  {u.name} <span className={u.g ? "opacity-70" : "text-accent-800"}>{u.g ? `${u.g} g` : "not set"}</span>
                                </span>
                              ))}
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          {me.role === "admin" && <StockCountDialog id={m.id} name={m.ink_name!} unit={m.unit} onHand={onHand} />}
                          {canSetMaterials && (
                            <MaterialSettingsDialog
                              material={{ id: m.id, name: m.name, unit: m.unit, reorder_level: reorder, use_basis: null, use_rate: null, active: true, ink: true }}
                            />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <h4 className="m-0 mb-1 mt-6 text-[16px]">Ink used by brand · last 30 days</h4>
            {inkUseBrands.length === 0 ? (
              <p className="m-0 py-2 text-[13px] opacity-60">No ink recorded on stillages or sample sheets in the last 30 days.</p>
            ) : (
              <div className="border-t border-divider">
                {inkUseBrands.map((brand) => {
                  const printed = printedBy.get(brand) ?? new Map<string, number>();
                  const sampled = sampledBy.get(brand) ?? new Map<string, number>();
                  const ids = [...new Set([...printed.keys(), ...sampled.keys()])].sort((a, b) => (inkLabel.get(a) ?? "").localeCompare(inkLabel.get(b) ?? ""));
                  const total = ids.reduce((t, id) => t + (printed.get(id) ?? 0) + (sampled.get(id) ?? 0), 0);
                  return (
                    <div key={brand} className="grid gap-x-4 gap-y-1 border-b border-divider py-2.5 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)_110px]">
                      <b className="truncate">{brand}</b>
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        {ids.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="inline-block size-3 shrink-0 rounded-full"
                              style={{ background: inkHex(inkLabel.get(id) ?? "") ?? "transparent", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)" }}
                            />
                            {inkLabel.get(id) ?? "Ink"} <b className="tabular-nums">{formatGrams((printed.get(id) ?? 0) + (sampled.get(id) ?? 0))}</b>
                            {sampled.get(id) ? <span className="text-[11px] opacity-65">({formatGrams(sampled.get(id)!)} samples)</span> : null}
                          </span>
                        ))}
                      </span>
                      <b className="tabular-nums sm:text-right">{formatGrams(total)}</b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canSetMaterials && offList.length > 0 && (
            <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-2 border-divider px-4 py-3 text-[12px] sm:px-8">
              <span className="opacity-70">Taken off the list (history kept):</span>
              {offList.map((m) => (
                <span key={m.id} className="inline-flex items-baseline gap-1.5">
                  {m.name}
                  <MaterialSettingsDialog
                    material={{ id: m.id, name: m.name, unit: m.unit, reorder_level: m.reorder_level == null ? null : Number(m.reorder_level), use_basis: m.use_basis, use_rate: m.use_rate == null ? null : Number(m.use_rate), active: false }}
                  />
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {view !== "raw" && (
        <div className="px-4 pb-8 pt-6 sm:px-8">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[26px] sm:text-[30px]">Finished goods by customer</h2>
            <form className="flex flex-wrap gap-2">
              {view !== "all" && <input type="hidden" name="v" value={view} />}
              <label htmlFor="inv-c" className="sr-only">Customer</label>
              <select id="inv-c" name="customer" defaultValue={sp.customer ?? ""} className="input w-[200px]">
                <option value="">All customers</option>
                {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label htmlFor="inv-q" className="sr-only">Search batch or order</label>
              <input id="inv-q" name="q" type="search" defaultValue={sp.q} placeholder="Search batch or order" className="input w-[220px]" />
              <button type="submit" className="btn btn-secondary text-text">Apply</button>
            </form>
          </div>
          <div className="mb-1 flex flex-wrap justify-end gap-3.5 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-text" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-neutral-400" />
              Reserved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-accent-800" />
              On hold
            </span>
          </div>
          {groups.length === 0 && <p className="m-0 border-t-2 border-text py-3 text-[13px] opacity-60">No finished stock.</p>}
          {groups.map((g) => (
            <div key={g.id} className="border-b-2 border-divider py-4 first:border-t-2 first:border-t-text">
              <div className="grid items-center gap-3 sm:grid-cols-[240px_minmax(0,1fr)_110px] sm:gap-5">
                <div className="min-w-0">
                  <b className="text-[16px]">{g.name}</b>
                  <div className="truncate text-[12px] opacity-65">{g.brands.join(" · ")}</div>
                </div>
                <div className="flex h-[22px] gap-0.5" role="img" aria-label={`${formatQty(g.available)} available, ${formatQty(g.reserved)} reserved, ${formatQty(g.hold)} on hold`}>
                  {g.available > 0 && <div className="bg-text" style={{ flex: g.available }} />}
                  {g.reserved > 0 && <div className="bg-neutral-400" style={{ flex: g.reserved }} />}
                  {g.hold > 0 && <div className="bg-accent-800" style={{ flex: g.hold }} />}
                  <div style={{ flex: Math.max(0.0001, maxTotal - g.total) }} />
                </div>
                <b className="text-[24px] tracking-[-.03em] sm:text-right sm:text-[26px]">{formatQty(g.total)}</b>
              </div>
              <div className="mt-2.5 overflow-x-auto sm:ml-[260px]">
                <div className="min-w-[780px]">
                  {g.rows.map((s) => (
                    <div key={s.id} className={`${COLS} border-t border-divider py-[7px] text-[13px]`}>
                      <b className="truncate">{s.brands?.name}</b>
                      <span>{s.batch_no}</span>
                      <b className="text-right tabular-nums">{formatQty(Number(s.quantity))}</b>
                      <span className="opacity-80" title="Internal">
                        {s.location ?? "-"}
                      </span>
                      <span>{formatDate(s.ready_since)}</span>
                      <span>
                        <Pill style={STOCK_PILL[s.status].style}>{STOCK_PILL[s.status].label}</Pill>
                      </span>
                      <span className="truncate text-[12px] opacity-80">
                        {s.order_id ? (
                          <Link href={`/ops/orders/${s.order_id}`} className="text-text">
                            {s.orders?.order_no}
                          </Link>
                        ) : null}
                        {s.customer_reason && <span className="text-accent-800"> · {s.customer_reason}</span>}
                      </span>
                      <span>
                        {canStock && (
                          <StockStatusDialog id={s.id} label={s.batch_no} status={s.status} reason={s.customer_reason ?? ""} location={s.location ?? ""} />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="mb-0 mt-3 text-[12px] opacity-60">Locations are internal. Customers see their own stock, status and hold reasons.</p>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { SectionHead } from "@/components/ops/OpsKit";
import { CROWNS_PER_BOX, CROWNS_PER_SHEET, fmt, formatAmount, num, type Plant } from "@/lib/calculator";
import { formatGrams } from "@/lib/ink-usage";
import { orderPlan, type PlanMaterial, type PlanRow } from "@/lib/order-plan";
import { pickDashboardMaterials } from "@/lib/stock-capacity";

export type PlanInk = { id: string; name: string; partNo: string | null; onHandKg: number; gPerSheet: number };

const input = "input !min-h-[52px] text-[18px] font-bold";

/**
 * The next shipment: crowns to make → what each material takes, what is in
 * stock and what to order, in barrels and pallets; and the inks, at what
 * printing has used per sheet. Nothing is saved.
 */
export default function ShipmentPlan({
  plant,
  materials,
  inks,
  inkSource,
  whiteSharePct,
  whiteShareFrom,
}: {
  plant: Plant;
  materials: PlanMaterial[];
  /** Inks with grams per sheet (from printing history, else an average brand). */
  inks: PlanInk[];
  /** Where the inks' grams per sheet come from, in words. */
  inkSource: string;
  /** The share of sheets with the white base coat to start from (%). */
  whiteSharePct: number;
  whiteShareFrom: string;
}) {
  const [crownsText, setCrownsText] = useState("500,000,000");
  const [wasteText, setWasteText] = useState("10");
  const [whiteText, setWhiteText] = useState(String(whiteSharePct));
  const [countStock, setCountStock] = useState(true);
  const [copied, setCopied] = useState(false);
  const crowns = Math.max(0, num(crownsText) || 0);
  const waste = Math.min(100, Math.max(0, num(wasteText) || 0));
  const white = Math.min(100, Math.max(0, num(whiteText) || 0));
  const rows = orderPlan(materials, plant, { crowns, wastagePct: waste, whiteShare: white / 100, countStock });
  // The main materials first, in the dashboard's order; the rest after.
  const { picked } = pickDashboardMaterials(
    materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, on_hand: m.onHand, reorder_level: null, use_basis: m.basis, use_rate: m.rate })),
  );
  const mainIds = picked.map((m) => m.id);
  const main = mainIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is PlanRow => Boolean(r));
  const other = rows.filter((r) => !mainIds.includes(r.id));
  const noRate = picked.filter((m) => !rows.some((r) => r.id === m.id)).map((m) => m.name);
  const sheets = crowns / CROWNS_PER_SHEET;
  const inkRows = inks
    .map((i) => {
      const needKg = (sheets * i.gPerSheet) / 1000;
      const withWaste = needKg * (1 + waste / 100);
      return { ...i, needKg, toOrderKg: Math.max(0, countStock ? withWaste - Math.max(0, i.onHandKg) : withWaste) };
    })
    .sort((a, b) => b.needKg - a.needKg);

  const line = (r: PlanRow) =>
    `${r.name}: ${formatAmount(r.toOrder, r.unit)}${r.packs ? ` (${r.packs.count.toLocaleString("en-US")} ${r.packs.label})` : ""}`;
  const text = [
    `Next shipment for ${fmt(crowns / 1_000_000, 1)} million crowns${waste ? ` with ${waste}% wastage` : ""}${countStock ? ", less stock on hand" : ""}:`,
    ...[...main, ...other].filter((r) => r.toOrder > 0).map(line),
    ...inkRows.filter((i) => i.toOrderKg > 0).map((i) => `${i.name}${i.partNo ? ` (${i.partNo})` : ""}: ${formatGrams(i.toOrderKg * 1000)}`),
  ].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const COLS = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3";
  const table = (list: PlanRow[]) => (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`${COLS} th-row border-b border-divider py-2`}>
          <span>Material</span>
          <span className="text-right">Needed</span>
          <span className="text-right">+ {waste}% wastage</span>
          <span className="text-right">In stock</span>
          <span className="text-right">{countStock ? "To order" : "Order"}</span>
          <span className="text-right">In packs</span>
        </div>
        {list.map((r) => (
          <div key={r.id} className={`${COLS} border-b border-divider py-2 text-[13px]`}>
            <span className="min-w-0">
              <b className="block truncate">{r.name}</b>
              {r.scope !== "all" && (
                <span className="block text-[11px] opacity-60">
                  {r.scope === "white" ? `${white}%` : `${100 - white}%`} of the sheets ({r.scope} base coat)
                </span>
              )}
            </span>
            <span className="text-right tabular-nums">{formatAmount(r.need, r.unit)}</span>
            <span className="text-right tabular-nums opacity-75">{r.wastage > 0 ? `+ ${formatAmount(r.wastage, r.unit)}` : "-"}</span>
            <span className="text-right tabular-nums opacity-75">{formatAmount(r.onHand, r.unit)}</span>
            <b className={`text-right tabular-nums ${r.toOrder > 0 ? "" : "opacity-50"}`}>{r.toOrder > 0 ? formatAmount(r.toOrder, r.unit) : "enough in stock"}</b>
            <span className="text-right tabular-nums">{r.packs ? `${r.packs.count.toLocaleString("en-US")} ${r.packs.label}` : "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <SectionHead title="Next shipment" aside="crowns to make → what to order" />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_150px_170px]">
        <div className="field">
          <label htmlFor="sp-crowns">Crowns to make</label>
          <input id="sp-crowns" inputMode="numeric" autoComplete="off" value={crownsText} onChange={(e) => setCrownsText(e.target.value)} className={input} />
          <span className="mt-1 text-[12px] opacity-70">{crowns >= 1_000_000 ? `${fmt(crowns / 1_000_000, 1)} million good crowns` : " "}</span>
        </div>
        <div className="field">
          <label htmlFor="sp-waste">Wastage to hold (%)</label>
          <input id="sp-waste" inputMode="decimal" autoComplete="off" value={wasteText} onChange={(e) => setWasteText(e.target.value)} className={input} />
        </div>
        <div className="field">
          <label htmlFor="sp-white">Sheets with white base coat (%)</label>
          <input id="sp-white" inputMode="decimal" autoComplete="off" value={whiteText} onChange={(e) => setWhiteText(e.target.value)} className={input} />
          <span className="mt-1 text-[11px] opacity-60">{whiteShareFrom}; the rest transparent</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={countStock} onChange={(e) => setCountStock(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Take off what is in stock now
        </label>
        <span className="text-[13px] opacity-80">
          {fmt(sheets, 0)} sheets · {fmt(plant.stillage_sheets > 0 ? sheets / plant.stillage_sheets : 0, 0)} stillages · {fmt(crowns / CROWNS_PER_BOX, 0)} boxes
        </span>
      </div>

      <h3 className="m-0 mt-2 text-[18px]">Main materials</h3>
      {main.length === 0 ? <p className="m-0 text-[13px] opacity-60">No usage rates on the main materials yet (Inventory → a material&apos;s Settings).</p> : table(main)}
      {noRate.length > 0 && <p className="m-0 text-[12px] opacity-70">Not counted (no usage rate in Inventory): {noRate.join(", ")}.</p>}

      <h3 className="m-0 mt-2 text-[18px]">Inks</h3>
      <p className="m-0 text-[12px] opacity-70">{inkSource}</p>
      {inkRows.length === 0 ? (
        <p className="m-0 text-[13px] opacity-60">No ink use yet to go on: record ink on printed stillages, or set grams per sheet under Inventory → Ink per sheet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="th-row grid grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-divider py-2">
              <span>Ink</span>
              <span className="text-right">g a sheet</span>
              <span className="text-right">Needed</span>
              <span className="text-right">In stock</span>
              <span className="text-right">{countStock ? "To order" : "Order"}{waste ? ` (+${waste}%)` : ""}</span>
            </div>
            {inkRows.map((i) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-divider py-2 text-[13px]">
                <span className="min-w-0">
                  <b className="block break-words">{i.name}</b>
                  {i.partNo && <span className="block font-mono text-[11px] opacity-60">{i.partNo}</span>}
                </span>
                <span className="text-right tabular-nums opacity-75">{fmt(i.gPerSheet, 2)}</span>
                <span className="text-right tabular-nums">{formatGrams(i.needKg * 1000)}</span>
                <span className="text-right tabular-nums opacity-75">{formatGrams(Math.max(0, i.onHandKg) * 1000)}</span>
                <b className={`text-right tabular-nums ${i.toOrderKg > 0 ? "" : "opacity-50"}`}>{i.toOrderKg > 0 ? formatGrams(i.toOrderKg * 1000) : "enough in stock"}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <>
          <h3 className="m-0 mt-2 text-[18px]">Other materials with a usage rate</h3>
          {table(other)}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="btn btn-secondary text-text">
          {copied ? "Copied" : "Copy the order list"}
        </button>
        <span className="text-[12px] opacity-70">As text, to paste into an email or message to the supplier.</span>
      </div>
      <p className="m-0 text-[12px] opacity-60">
        To order = needed + the wastage held, less what is in stock. From the usage rates in Inventory and the plant settings ({CROWNS_PER_SHEET} crowns a sheet, {CROWNS_PER_BOX.toLocaleString("en-US")} a box). Expired stock counts as in stock; untick
        &ldquo;Take off what is in stock&rdquo; to see the whole amount. Nothing is saved.
      </p>
    </>
  );
}

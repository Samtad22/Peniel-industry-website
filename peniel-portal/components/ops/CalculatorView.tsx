"use client";

import { useState } from "react";
import { SectionHead } from "@/components/ops/OpsKit";
import {
  convertWeight,
  CROWNS_PER_BOX,
  CROWNS_PER_SHEET,
  fmt,
  formatAmount,
  formatHours,
  needFor,
  num,
  PASSES_PER_STILLAGE,
  WEIGHT,
  yieldOfCrowns,
  yieldOfMaterial,
  yieldOfStillages,
  type Basis,
  type Plant,
  type WeightUnit,
  type Yield,
} from "@/lib/calculator";
import { formatGrams, type BrandInk } from "@/lib/ink-usage";
import { USE_BASIS, type UseBasis } from "@/lib/materials";

export type CalcMaterial = { id: string; name: string; unit: string; onHand: number; basis: string | null; rate: number | null };
export type CalcBrand = { id: string; label: string; inks: (BrandInk & { onHandKg: number })[] };

const UNITS = Object.keys(WEIGHT) as WeightUnit[];
const isKg = (unit: string) => unit.trim().toLowerCase() === "kg";
const input = "input !min-h-[52px] text-[18px] font-bold";

/** The figures an amount of crowns comes to, as tiles. */
function Tiles({ y, plant }: { y: Yield | null; plant: Plant }) {
  if (!y) return <p className="m-0 border-2 border-dashed border-divider px-4 py-3 text-[13px] opacity-70">Enter a usage rate to see what it makes.</p>;
  const tiles = [
    { label: "Sheets", value: fmt(y.sheets, 0), sub: `${CROWNS_PER_SHEET} crowns a sheet` },
    { label: "Stillages", value: fmt(y.stillages, 1), sub: `${plant.stillage_sheets.toLocaleString("en-US")} sheets each` },
    { label: "Crowns", value: fmt(y.crowns, 0), sub: y.crowns >= 1_000_000 ? `${fmt(y.crowns / 1_000_000, 2)} million` : undefined },
    { label: "Boxes", value: fmt(y.boxes, 1), sub: `${CROWNS_PER_BOX.toLocaleString("en-US")} crowns a box` },
    { label: "Press time, both liners", value: formatHours(y.pressHours), sub: `${plant.press_per_hour.toLocaleString("en-US")} an hour` },
    { label: "One liner", value: formatHours(y.linerHours), sub: `${fmt(y.shifts, 1)} shifts of ${plant.shift_hours} h on one press` },
  ];
  return (
    <div className="grid grid-cols-2 border-l-2 border-t-2 border-text sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-0.5 border-b-2 border-r-2 border-text px-3 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[.08em] opacity-70">{t.label}</span>
          <b className="text-[22px] leading-tight tracking-[-.02em] tabular-nums">{t.value}</b>
          {t.sub && <span className="text-[11px] opacity-60">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function UnitSelect({ value, onChange, label }: { value: WeightUnit; onChange: (u: WeightUnit) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as WeightUnit)} className="input !min-h-[52px] !w-[78px] shrink-0 border-l-0 text-[16px]">
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}

/**
 * The admin's calculator: tonnes to kg, what stillages and materials make,
 * and what an amount of crowns consumes. Nothing is saved.
 */
export default function CalculatorView({ plant, materials, brands }: { plant: Plant; materials: CalcMaterial[]; brands: CalcBrand[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-2">
      <section className="flex flex-col gap-4 border-b-2 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
        <Convert />
      </section>
      <section className="flex flex-col gap-4 border-b-2 border-divider px-4 py-6 sm:px-8">
        <Stillages plant={plant} />
      </section>
      <section className="flex flex-col gap-4 border-b-2 border-divider px-4 py-6 sm:px-8 xl:col-span-2">
        <MaterialMakes plant={plant} materials={materials} brands={brands} />
      </section>
      <section className="flex flex-col gap-4 px-4 py-6 sm:px-8 xl:col-span-2">
        <Consumption plant={plant} materials={materials} brands={brands} />
      </section>
    </div>
  );
}

function Convert() {
  const [value, setValue] = useState("1");
  const [unit, setUnit] = useState<WeightUnit>("t");
  const v = num(value);
  return (
    <>
      <SectionHead title="Convert" aside="metric tons, kg, grams" />
      <label htmlFor="cv-v" className="text-[12px] opacity-70">
        Amount
      </label>
      <div className="flex max-w-[360px]">
        <input id="cv-v" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className={`${input} min-w-0 flex-1`} />
        <UnitSelect value={unit} onChange={setUnit} label="Unit" />
      </div>
      <div className="grid grid-cols-3 border-l-2 border-t-2 border-text">
        {UNITS.map((u) => (
          <div key={u} className={`flex flex-col gap-0.5 border-b-2 border-r-2 border-text px-3 py-2.5 ${u === unit ? "bg-surface" : ""}`}>
            <span className="text-[11px] font-bold uppercase tracking-[.08em] opacity-70">{u === "t" ? "Metric tons" : u === "kg" ? "Kilograms" : "Grams"}</span>
            <b className="break-all text-[20px] leading-tight tabular-nums">{Number.isNaN(v) ? "-" : convertWeight(v, unit, u).toLocaleString("en-US", { maximumFractionDigits: 6 })}</b>
            <span className="text-[11px] opacity-60">{u}</span>
          </div>
        ))}
      </div>
      <p className="m-0 text-[12px] opacity-65">1 metric ton = 1,000 kg = 1,000,000 g.</p>
    </>
  );
}

function Stillages({ plant }: { plant: Plant }) {
  const [count, setCount] = useState("1");
  const [sheets, setSheets] = useState(String(plant.stillage_sheets));
  const c = num(count);
  const s = num(sheets);
  const y = Number.isNaN(c) || Number.isNaN(s) ? null : yieldOfStillages(c, plant, s);
  return (
    <>
      <SectionHead title="What stillages make" aside="crowns and time on the press" />
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="st-n">Stillages</label>
          <input id="st-n" inputMode="decimal" autoComplete="off" value={count} onChange={(e) => setCount(e.target.value)} className={input} />
        </div>
        <div className="field">
          <label htmlFor="st-s">Sheets per stillage</label>
          <input id="st-s" inputMode="numeric" autoComplete="off" value={sheets} onChange={(e) => setSheets(e.target.value)} className={input} />
        </div>
      </div>
      <Tiles y={y} plant={plant} />
    </>
  );
}

/** One thing that can be used up: a raw material, or a brand's ink. */
type Pick = { key: string; name: string; unit: string; onHand: number; basis: Basis | null; rate: number | null; ink: boolean };

function picks(materials: CalcMaterial[], brands: CalcBrand[]): { group: string; items: Pick[] }[] {
  const mats: Pick[] = materials.map((m) => ({ key: `m:${m.id}`, name: m.name, unit: m.unit, onHand: m.onHand, basis: (m.basis as Basis | null) ?? null, rate: m.rate, ink: false }));
  const inks = brands
    .filter((b) => b.inks.length)
    .map((b) => ({
      group: `Ink · ${b.label}`,
      items: b.inks.map((i) => ({ key: `i:${b.id}:${i.materialId}`, name: `${i.name} (${b.label.split(" · ")[0]})`, unit: "kg", onHand: i.onHandKg, basis: "ink" as Basis, rate: i.gPerSheet, ink: true })),
    }));
  return [{ group: "Raw materials", items: mats }, ...inks];
}

function MaterialMakes({ plant, materials, brands }: { plant: Plant; materials: CalcMaterial[]; brands: CalcBrand[] }) {
  const groups = picks(materials, brands);
  const all = groups.flatMap((g) => g.items);
  const first = all.find((p) => /varnish/i.test(p.name)) ?? all[0];
  const [key, setKey] = useState(first?.key ?? "");
  const pick = all.find((p) => p.key === key);
  const [amount, setAmount] = useState("600");
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [basis, setBasis] = useState<Basis>(pick?.basis ?? "varnish_sheet");
  const [rate, setRate] = useState(pick?.rate != null ? String(pick.rate) : "");
  const choose = (k: string) => {
    const p = all.find((x) => x.key === k);
    setKey(k);
    setBasis(p?.basis ?? "varnish_sheet");
    setRate(p?.rate != null ? String(p.rate) : "");
    setUnit("kg");
  };
  if (!pick) return <p className="m-0 text-[13px] opacity-70">No raw materials on the list yet.</p>;

  const weighed = pick.ink || isKg(pick.unit);
  const typed = num(amount);
  // In the material's own unit; inks in grams (their rate is grams per sheet).
  const qty = Number.isNaN(typed) ? NaN : pick.ink ? convertWeight(typed, unit, "g") : weighed ? convertWeight(typed, unit, "kg") : typed;
  const r = num(rate.replace(",", "."));
  const y = Number.isNaN(qty) || Number.isNaN(r) ? null : yieldOfMaterial(qty, basis, r, plant);
  const per = basis === "ink" ? "sheet printed" : USE_BASIS[basis as UseBasis]?.per ?? "";
  const rateUnit = pick.ink ? "g" : pick.unit;
  const useStock = () => {
    setUnit("kg");
    setAmount(String(Math.max(0, Math.round(pick.onHand * 1000) / 1000)));
  };

  return (
    <>
      <SectionHead title="What a material makes" aside="e.g. 600 L of varnish or lacquer, or kg of an ink" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="field">
          <label htmlFor="mm-pick">Material</label>
          <select id="mm-pick" value={key} onChange={(e) => choose(e.target.value)} className="input !min-h-[52px] text-[15px]">
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-[12px] opacity-65">
            In stock: {formatAmount(pick.onHand, pick.unit)} ·{" "}
            <button type="button" onClick={useStock} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
              use the stock
            </button>
          </span>
        </div>
        <div className="field">
          <label htmlFor="mm-amount">Amount{weighed ? "" : ` (${pick.unit})`}</label>
          <div className="flex">
            <input id="mm-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} min-w-0 flex-1`} />
            {weighed && <UnitSelect value={unit} onChange={setUnit} label="Amount unit" />}
          </div>
        </div>
        <div className="field">
          <label htmlFor="mm-rate">
            {rateUnit} used per {per}
          </label>
          <input id="mm-rate" inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 0.01" className={input} />
          {!pick.ink && (
            <select aria-label="Used per" value={basis} onChange={(e) => setBasis(e.target.value as Basis)} className="input mt-1 min-h-10 text-[13px]">
              {(Object.keys(USE_BASIS) as UseBasis[]).map((b) => (
                <option key={b} value={b}>
                  {USE_BASIS[b].label}
                </option>
              ))}
            </select>
          )}
          <span className="text-[12px] opacity-65">
            {pick.rate != null ? `From Inventory: ${pick.rate} ${rateUnit}. Change it to try another figure.` : "No usage rate in Inventory yet: type one to try."}
          </span>
        </div>
      </div>
      {basis === "oven_pass" && <p className="m-0 text-[12px] opacity-70">Counted as {PASSES_PER_STILLAGE} oven passes a stillage (varnish and lacquer).</p>}
      <Tiles y={y} plant={plant} />
    </>
  );
}

function Consumption({ plant, materials, brands }: { plant: Plant; materials: CalcMaterial[]; brands: CalcBrand[] }) {
  const [value, setValue] = useState("1,000,000");
  const [mode, setMode] = useState<"crowns" | "stillages" | "sheets">("crowns");
  const [brandId, setBrandId] = useState(brands.find((b) => b.inks.length)?.id ?? "");
  const v = num(value);
  const crowns = Number.isNaN(v) ? 0 : mode === "crowns" ? v : mode === "sheets" ? v * CROWNS_PER_SHEET : v * plant.stillage_sheets * CROWNS_PER_SHEET;
  const y = yieldOfCrowns(crowns, plant);
  const brand = brands.find((b) => b.id === brandId);
  const tracked = materials.filter((m) => m.basis && m.rate && m.rate > 0);
  const untracked = materials.filter((m) => !(m.basis && m.rate && m.rate > 0));
  const rows = [
    ...tracked.map((m) => {
      const need = needFor(crowns, m.basis as Basis, Number(m.rate), plant);
      return { key: m.id, name: m.name, per: `${m.rate} ${m.unit} per ${USE_BASIS[m.basis as UseBasis]?.per ?? m.basis}`, need: formatAmount(need, m.unit), stock: formatAmount(m.onHand, m.unit), left: m.onHand - need, leftText: formatAmount(m.onHand - need, m.unit) };
    }),
    ...(brand?.inks ?? [])
      .filter((i) => i.gPerSheet)
      .map((i) => {
        const g = needFor(crowns, "ink", Number(i.gPerSheet), plant);
        const stockG = i.onHandKg * 1000;
        return { key: i.materialId, name: `${i.name} ink`, per: `${i.gPerSheet} g per sheet printed`, need: formatGrams(g), stock: formatGrams(stockG), left: stockG - g, leftText: formatGrams(stockG - g) };
      }),
  ];
  const noInkRate = (brand?.inks ?? []).filter((i) => !i.gPerSheet).map((i) => i.name);
  const COLS = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3";

  return (
    <>
      <SectionHead title="Consumption summary" aside="what an amount of crowns takes, against the stock" />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)]">
        <div className="field">
          <label htmlFor="cs-v">Amount</label>
          <input id="cs-v" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        </div>
        <div className="field">
          <label htmlFor="cs-mode">Of</label>
          <select id="cs-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input !min-h-[52px] text-[15px]">
            <option value="crowns">Crowns</option>
            <option value="stillages">Stillages</option>
            <option value="sheets">Sheets</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cs-brand">Brand (for its inks)</label>
          <select id="cs-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input !min-h-[52px] text-[15px]">
            <option value="">No inks</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Tiles y={y} plant={plant} />
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${COLS} th-row border-b border-divider py-2`}>
            <span>Material</span>
            <span>Usage rate</span>
            <span className="text-right">Needed</span>
            <span className="text-right">In stock</span>
            <span className="text-right">Left after</span>
          </div>
          {rows.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No usage rates set yet (Inventory → a material&apos;s Settings, and Ink per sheet).</p>}
          {rows.map((r) => (
            <div key={r.key} className={`${COLS} border-b border-divider py-2 text-[13px] ${r.left < 0 ? "bg-accent-100" : ""}`}>
              <b className="truncate">{r.name}</b>
              <span className="truncate opacity-75">{r.per}</span>
              <b className="text-right tabular-nums">{r.need}</b>
              <span className="text-right tabular-nums opacity-80">{r.stock}</span>
              <span className={`text-right tabular-nums ${r.left < 0 ? "font-extrabold text-accent-800" : ""}`}>{r.left < 0 ? `short ${r.leftText.replace("-", "")}` : r.leftText}</span>
            </div>
          ))}
        </div>
      </div>
      {(untracked.length > 0 || noInkRate.length > 0) && (
        <p className="m-0 text-[12px] opacity-70">
          Not counted (no usage rate): {[...untracked.map((m) => m.name), ...noInkRate.map((n) => `${n} ink`)].join(", ")}.
        </p>
      )}
      <p className="m-0 text-[12px] opacity-60">
        Sheets don&apos;t include spoilage; oven passes count {PASSES_PER_STILLAGE} a stillage. Rates come from Inventory and the plant settings.
      </p>
    </>
  );
}

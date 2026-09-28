"use client";

import { useState } from "react";
import { bestUnit, formatGrams, fromGrams, inkFor, toGrams, type BrandInk } from "@/lib/ink-usage";

type Override = { v: string; unit: "g" | "kg" };

/**
 * Ink used, one line per ink printed: filled in from the brand's grams per
 * sheet × the sheets, and the printer can type the real figure in g or kg.
 * Sends `inks` = JSON {"<ink material id>": grams} ("invalid" when a figure
 * isn't a number, so the server refuses it).
 */
export default function InkFields({ inks, sheets, idPrefix }: { inks: BrandInk[]; sheets: number; idPrefix: string }) {
  const [over, setOver] = useState<Record<string, Override>>({});
  const rows = inks.map((i) => {
    const auto = inkFor(sheets, i.gPerSheet);
    const o = over[i.materialId];
    const unit = o?.unit ?? bestUnit(auto);
    const value = o ? o.v : auto ? fromGrams(auto, unit) : "";
    const grams = o ? toGrams(o.v, o.unit) : auto;
    return { i, auto, o, unit, value, grams };
  });
  const invalid = rows.some((r) => Number.isNaN(r.grams));
  const json = invalid ? "invalid" : JSON.stringify(Object.fromEntries(rows.filter((r) => r.grams > 0).map((r) => [r.i.materialId, r.grams])));
  const total = rows.reduce((t, r) => t + (Number.isNaN(r.grams) ? 0 : r.grams), 0);

  if (inks.length === 0) return null;
  return (
    <fieldset className="field m-0 border-0 p-0">
      <input type="hidden" name="inks" value={json} />
      <legend className="mb-[5px] flex w-full justify-between gap-2 p-0 text-[12px] text-text/70">
        <span>Ink used</span>
        <span>{total > 0 ? `${formatGrams(total)} in all` : ""}</span>
      </legend>
      <div className="border-t border-divider">
        {rows.map(({ i, auto, o, unit, value, grams }) => (
          <div key={i.materialId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,150px)] items-center gap-x-3 gap-y-1 border-b border-divider py-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_170px]">
            <label htmlFor={`${idPrefix}-${i.materialId}`} className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block size-4 shrink-0 rounded-full"
                  style={{ background: i.hex ?? "transparent", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)" }}
                />
                <b className="truncate">{i.name}</b>
              </span>
              <span className="text-[11px] opacity-65">
                {i.gPerSheet ? `${i.gPerSheet} g a sheet × ${sheets.toLocaleString("en-US")} = ${formatGrams(auto)}` : "No grams per sheet set (Inventory → Ink per sheet): type it"}
                {o && i.gPerSheet ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() =>
                        setOver((x) => {
                          const next = { ...x };
                          delete next[i.materialId];
                          return next;
                        })
                      }
                      className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent-800 underline underline-offset-2"
                    >
                      use {formatGrams(auto)}
                    </button>
                  </>
                ) : null}
              </span>
            </label>
            <span className="flex">
              <input
                id={`${idPrefix}-${i.materialId}`}
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setOver((x) => ({ ...x, [i.materialId]: { v: e.target.value, unit } }))}
                placeholder="0"
                aria-invalid={Number.isNaN(grams) || undefined}
                className={`input min-h-11 min-w-0 flex-1 text-right text-[15px] font-bold ${Number.isNaN(grams) ? "!border-accent" : ""}`}
              />
              <select
                aria-label={`${i.name}: unit`}
                value={unit}
                onChange={(e) => {
                  const next = e.target.value as "g" | "kg";
                  // Same amount, shown in the other unit.
                  const g = Number.isNaN(grams) ? 0 : grams;
                  setOver((x) => ({ ...x, [i.materialId]: { v: g ? fromGrams(g, next) : "", unit: next } }));
                }}
                className="input !w-[64px] min-h-11 shrink-0 border-l-0"
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </span>
          </div>
        ))}
      </div>
      {invalid && <p className="m-0 mt-1 text-[12px] font-bold text-accent-800">Ink: type a number (e.g. 850 g or 1.2 kg).</p>}
    </fieldset>
  );
}

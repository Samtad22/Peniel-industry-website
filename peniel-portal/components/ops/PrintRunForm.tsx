"use client";

import { useActionState, useState } from "react";
import { deletePrintRun, savePrintRun, type PrintRunState } from "@/app/ops/production/sheets/actions";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { formatQty } from "@/lib/format";
import { parseInk } from "@/lib/inks";
import { CROWNS_PER_SHEET, crownsFromSheets, formatSpoiledPct, STILLAGE_SHEETS, wholeNumber } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/** A brand whose design can be printed, with its colours. */
export type PrintBrand = { id: string; label: string; colours: string[] };


const fmt = (v: string) => {
  const n = wholeNumber(v);
  return v && Number.isFinite(n) ? n.toLocaleString("en-US") : v;
};

/**
 * Step 1 of a stillage (internal only): off the print line, the two-unit
 * roller printer with the UV dryer at its end. The brand printed and the
 * sheets on the stillage; varnish and lacquer are logged against it after.
 * Tablet-friendly, like the daily production entry.
 */
export default function PrintRunForm({
  today,
  brands,
  nextNo,
}: {
  today: string;
  brands: PrintBrand[];
  /** The stillage number to suggest (the last one + 1). */
  nextNo: string;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [printed, setPrinted] = useState(String(STILLAGE_SHEETS));
  const [spoiled, setSpoiled] = useState("");
  const [stillage, setStillage] = useState(nextNo);
  const [state, action, pending] = useActionState<PrintRunState, FormData>(async (prev, fd) => {
    const res = await savePrintRun(prev, fd);
    // Saved: keep the brand and shift; suggest the next stillage number.
    if (res?.ok) {
      setPrinted(String(STILLAGE_SHEETS));
      setSpoiled("");
      setStillage((prevNo) => {
        const m = /^(.*?)(\d+)$/.exec(prevNo.trim());
        return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}` : "";
      });
    }
    return res;
  }, null);

  const p = Number.isFinite(wholeNumber(printed)) ? wholeNumber(printed) : 0;
  const sp = Number.isFinite(wholeNumber(spoiled)) ? wholeNumber(spoiled) : 0;
  const seg = "seg-opt min-h-[52px] flex-1 justify-center text-[15px]";
  const big = "input !min-h-[56px] text-[22px] font-extrabold";

  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div className="flex justify-end">
        <InternalOnly>Internal only · customers never see printed sheets</InternalOnly>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="pr-date">
          <input id="pr-date" name="run_date" type="date" defaultValue={today} max={today} required className="input !min-h-[52px] text-[16px]" />
        </Field>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">Shift</legend>
          <div className="seg !flex">
            {SHIFTS.map((s, i) => (
              <label key={s} className={seg}>
                <input type="radio" name="shift" value={s} defaultChecked={i === 0} required />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Field label="Brand printed" htmlFor="pr-brand">
          <select id="pr-brand" name="brand_id" required value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input !min-h-[52px] text-[16px]">
            {brands.length === 0 && <option value="">No brands yet</option>}
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stillage no." htmlFor="pr-stillage">
          <input id="pr-stillage" name="stillage_no" required maxLength={40} value={stillage} onChange={(e) => setStillage(e.target.value)} placeholder="e.g. ST-014" className="input !min-h-[52px] text-[16px]" />
        </Field>
      </div>

      {brand && (
        <fieldset className="field m-0 border-0 p-0" key={brand.id}>
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">Colours printed</legend>
          {brand.colours.length === 0 ? (
            <p className="m-0 text-[13px] opacity-70">No colours on file for this brand. Add them under Customers.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {brand.colours.map((c) => {
                const ink = parseInk(c);
                return (
                  <label key={c} className="inline-flex min-h-11 cursor-pointer items-center gap-2 border-2 border-text px-3 text-[14px] has-[:checked]:bg-text has-[:checked]:text-bg">
                    <input type="checkbox" name="colours" value={c} defaultChecked className="sr-only" />
                    <span
                      aria-hidden="true"
                      className="inline-block size-4 shrink-0 rounded-full"
                      style={{ background: ink.hex ?? "transparent", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)" }}
                    />
                    {ink.name}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Good sheets on the stillage" htmlFor="pr-printed" hint={`About 1,400 to 1,420. Starts at ${STILLAGE_SHEETS.toLocaleString("en-US")}.`}>
          <input id="pr-printed" name="sheets_printed" inputMode="numeric" autoComplete="off" value={fmt(printed)} onChange={(e) => setPrinted(e.target.value)} placeholder="0" className={big} />
        </Field>
        <Field label="Spoiled on the print line" htmlFor="pr-spoiled">
          <input id="pr-spoiled" name="sheets_spoiled" inputMode="numeric" autoComplete="off" value={fmt(spoiled)} onChange={(e) => setSpoiled(e.target.value)} placeholder="0" className={big} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3.5 py-3 text-[14px]">
        <span>
          <b>{p.toLocaleString("en-US")}</b> good sheets · spoiled <b>{formatSpoiledPct(p, sp)}</b>
        </span>
        <span className="text-[12px] opacity-60">about {p ? formatQty(crownsFromSheets(p, CROWNS_PER_SHEET)) : "0"} crowns at {CROWNS_PER_SHEET}/sheet</span>
      </div>

      <Field label="Tinplate coil / lot" htmlFor="pr-coil">
        <input id="pr-coil" name="coil_lot" maxLength={60} placeholder="e.g. TP-2291" className="input min-h-11" />
      </Field>
      <Field label="Notes (internal)" htmlFor="pr-notes">
        <textarea id="pr-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending || !brandId || !stillage.trim() || p + sp === 0} icon="✓" className="min-h-[60px] px-5 py-4 text-[17px]">
        {pending ? "Saving…" : "Save printed stillage"}
      </Button>
    </form>
  );
}

/** Delete a stillage entered by mistake. */
export function DeletePrintRunButton({ id }: { id: string }) {
  return (
    <form
      action={deletePrintRun}
      onSubmit={(e) => {
        if (!confirm("Delete this stillage?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label="Delete this stillage" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
        Delete
      </button>
    </form>
  );
}

"use client";

import { usePlant } from "@/components/PlantSettings";
import { useActionState, useState } from "react";
import { deletePrintRun, savePrintRun, type PrintRunState } from "@/app/ops/production/sheets/actions";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { formatQty } from "@/lib/format";
import InkFields from "@/components/ops/InkFields";
import { inkKey, type BrandInk } from "@/lib/ink-usage";
import { parseInk } from "@/lib/inks";
import { BASE_COAT_LABEL, CROWNS_PER_SHEET, crownsFromSheets, formatSpoiledPct, MAX_STILLAGES_AT_ONCE, stillageNumbers, wholeNumber, type BaseCoat } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/** A brand whose design can be printed, with its colours and their inks (grams per sheet). */
export type PrintBrand = { id: string; label: string; colours: string[]; baseCoat?: BaseCoat | null; inks?: BrandInk[] };

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
  fixed,
  onDone,
}: {
  today: string;
  brands: PrintBrand[];
  /** The stillage number to suggest (the last one + 1). */
  nextNo: string;
  /** Printing a base-coated stillage that is waiting for the print line. */
  fixed?: { id: string; brandId: string; stillageNo: string; sheets: number | null };
  onDone?: () => void;
}) {
  const { stillage_sheets: STILLAGE_SHEETS } = usePlant();
  // A base-coated stillage with no brand yet: the brand is chosen now.
  const lockBrand = Boolean(fixed?.brandId);
  const [brandId, setBrandIdRaw] = useState(fixed?.brandId || brands[0]?.id || "");
  const brand = brands.find((b) => b.id === brandId);
  // Colours not printed this time (all are ticked to start with).
  const [off, setOff] = useState<Set<string>>(new Set());
  const [savedCount, setSavedCount] = useState(0);
  const setBrandId = (id: string) => {
    setBrandIdRaw(id);
    setOff(new Set());
  };
  const [printed, setPrinted] = useState(String(fixed?.sheets ?? STILLAGE_SHEETS));
  const [spoiled, setSpoiled] = useState("");
  const [stillage, setStillage] = useState(fixed?.stillageNo ?? nextNo);
  const [count, setCount] = useState("1");
  // Cancel: start the form again (nothing is saved), or close the dialog.
  const [formKey, setFormKey] = useState(0);
  const cancel = () => {
    if (fixed) return onDone?.();
    setPrinted(String(STILLAGE_SHEETS));
    setSpoiled("");
    setStillage(nextNo);
    setCount("1");
    setBrandId(brands[0]?.id ?? "");
    setFormKey((k) => k + 1);
    setOff(new Set());
  };
  const [state, action, pending] = useActionState<PrintRunState, FormData>(async (prev, fd) => {
    const res = await savePrintRun(prev, fd);
    // Saved: keep the brand and shift; suggest the number after the last one saved.
    if (res?.ok && fixed) onDone?.();
    if (res?.ok && !fixed) {
      const saved = Math.max(1, wholeNumber(String(fd.get("stillages") ?? "1")) || 1);
      setPrinted(String(STILLAGE_SHEETS));
      setSpoiled("");
      setCount("1");
      setStillage((prevNo) => stillageNumbers(prevNo, saved + 1)?.[saved] ?? "");
      setSavedCount((n) => n + 1);
    }
    return res;
  }, null);

  const p = Number.isFinite(wholeNumber(printed)) ? wholeNumber(printed) : 0;
  const sp = Number.isFinite(wholeNumber(spoiled)) ? wholeNumber(spoiled) : 0;
  const c = fixed ? 1 : Math.min(MAX_STILLAGES_AT_ONCE, Math.max(0, Number.isFinite(wholeNumber(count)) ? wholeNumber(count) : 0));
  const good = p * c;
  const numbers = c > 1 ? stillageNumbers(stillage, c) : null;
  const step = (d: number) => setCount(String(Math.min(MAX_STILLAGES_AT_ONCE, Math.max(1, (c || 1) + d))));
  // Ink for the colours printed, over every sheet through the printer (good and spoiled).
  const printedKeys = new Set((brand?.colours ?? []).filter((col) => !off.has(col)).map(inkKey));
  const inks = (brand?.inks ?? []).filter((i) => printedKeys.has(inkKey(i.name)));
  const throughPrinter = good + sp;
  const seg = "seg-opt min-h-[52px] flex-1 justify-center text-[15px]";
  const big = "input !min-h-[56px] text-[22px] font-extrabold";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-[18px]">
      {fixed && <input type="hidden" name="id" value={fixed.id} />}
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

      {fixed && !lockBrand ? (
        <>
          <input type="hidden" name="stillage_no" value={stillage} />
          <p className="m-0 text-[14px]">
            Stillage <b className="font-mono">{stillage}</b> · base-coated stock, now off the print line. Choose the brand printed on it.
          </p>
          <Field label="Brand printed" htmlFor="pr-brand">
            <select id="pr-brand" name="brand_id" required value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input !min-h-[52px] text-[16px]">
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : fixed ? (
        <>
          <input type="hidden" name="brand_id" value={brandId} />
          <input type="hidden" name="stillage_no" value={stillage} />
          <p className="m-0 text-[14px]">
            Stillage <b className="font-mono">{stillage}</b> · {brand?.label ?? ""} · base-coated, now off the print line.
          </p>
        </>
      ) : (
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
        <Field
          label={c > 1 ? "First stillage no." : "Stillage no."}
          htmlFor="pr-stillage"
          hint={c > 1 ? (numbers ? `${numbers[0]} to ${numbers[c - 1]}` : "End it with a number, e.g. ST-014") : undefined}
        >
          <input id="pr-stillage" name="stillage_no" required maxLength={40} value={stillage} onChange={(e) => setStillage(e.target.value)} placeholder="e.g. ST-014" className="input !min-h-[52px] text-[16px]" />
        </Field>
      </div>
      )}
      {!fixed && brand?.baseCoat && (
        <p role="note" className="m-0 border-l-4 border-accent bg-accent-100 px-3 py-2 text-[13px]">
          {brand.label.split(" · ")[0]} needs a {BASE_COAT_LABEL[brand.baseCoat].toLowerCase()} before printing. Base coat the stillage first
          (&ldquo;00 · Base coat&rdquo;), then print it from &ldquo;Waiting for printing&rdquo;.
        </p>
      )}

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
                    <input
                      type="checkbox"
                      name="colours"
                      value={c}
                      checked={!off.has(c)}
                      onChange={(e) =>
                        setOff((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.delete(c);
                          else next.add(c);
                          return next;
                        })
                      }
                      className="sr-only"
                    />
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

      {!fixed && (
        <Field label="Stillages" htmlFor="pr-count" hint={`Each is saved as its own stillage, numbered on from the first. Up to ${MAX_STILLAGES_AT_ONCE} at a time.`}>
          <div className="flex w-full max-w-[280px]">
            <button type="button" aria-label="One stillage less" onClick={() => step(-1)} disabled={c <= 1} className="w-14 shrink-0 cursor-pointer border-2 border-r-0 border-text bg-bg text-[24px] disabled:opacity-40">
              −
            </button>
            <input
              id="pr-count"
              name="stillages"
              inputMode="numeric"
              autoComplete="off"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className={`${big} w-0 min-w-0 flex-1 text-center`}
            />
            <button type="button" aria-label="One stillage more" onClick={() => step(1)} disabled={c >= MAX_STILLAGES_AT_ONCE} className="w-14 shrink-0 cursor-pointer border-2 border-l-0 border-text bg-bg text-[24px] disabled:opacity-40">
              +
            </button>
          </div>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={fixed ? "Good sheets on the stillage" : "Good sheets per stillage"}
          htmlFor="pr-printed"
          hint={`About 1,400 to 1,420. Starts at ${STILLAGE_SHEETS.toLocaleString("en-US")}.`}
        >
          <input id="pr-printed" name="sheets_printed" inputMode="numeric" autoComplete="off" value={fmt(printed)} onChange={(e) => setPrinted(e.target.value)} placeholder="0" className={big} />
        </Field>
        <Field label={c > 1 ? "Spoiled on the print line (all)" : "Spoiled on the print line"} htmlFor="pr-spoiled">
          <input id="pr-spoiled" name="sheets_spoiled" inputMode="numeric" autoComplete="off" value={fmt(spoiled)} onChange={(e) => setSpoiled(e.target.value)} placeholder="0" className={big} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3.5 py-3 text-[14px]">
        <span>
          {c > 1 && (
            <>
              {c} stillages × {p.toLocaleString("en-US")} ={" "}
            </>
          )}
          <b>{good.toLocaleString("en-US")}</b> good sheets · spoiled <b>{formatSpoiledPct(good, sp)}</b>
        </span>
        <span className="text-[13px]">
          × {CROWNS_PER_SHEET} = <b>{crownsFromSheets(good, CROWNS_PER_SHEET).toLocaleString("en-US")}</b> crowns{" "}
          <span className="opacity-60">({good ? formatQty(crownsFromSheets(good, CROWNS_PER_SHEET)) : "0"})</span>
        </span>
      </div>

      {inks.length > 0 ? (
        <InkFields key={`${formKey}-${brandId}-${savedCount}`} inks={inks} sheets={throughPrinter} idPrefix="pr-ink" />
      ) : (
        <input type="hidden" name="inks" value="{}" />
      )}

      <Field label="Tinplate coil / lot" htmlFor="pr-coil">
        <input id="pr-coil" name="coil_lot" maxLength={60} placeholder="e.g. TP-2291" className="input min-h-11" />
      </Field>
      <Field label="Notes (internal)" htmlFor="pr-notes">
        <textarea id="pr-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>

      <FormMessage state={state} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <Button type="button" variant="secondary" onClick={cancel} disabled={pending} icon="✕" className="min-h-[60px] px-5 py-4 text-[17px] text-text">
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !brandId || !stillage.trim() || p + sp === 0 || c < 1 || (c > 1 && !numbers)} icon="✓" className="min-h-[60px] px-5 py-4 text-[17px]">
          {pending ? "Saving…" : fixed ? "Save: printed" : c > 1 ? `Save ${c} printed stillages` : "Save printed stillage"}
        </Button>
      </div>
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

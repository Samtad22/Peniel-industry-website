"use client";

import { useActionState, useState } from "react";
import { deletePrintRun, savePrintRun, type PrintRunState } from "@/app/ops/production/sheets/actions";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { formatQty } from "@/lib/format";
import { parseInk } from "@/lib/inks";
import { crownsFromSheets, formatSpoiledPct, wholeNumber } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/** An order the coat & print line can print for: its brand's colours and the last crowns-per-sheet used. */
export type PrintOrder = { id: string; label: string; colours: string[]; perSheet: number | null };

const fmt = (v: string) => {
  const n = wholeNumber(v);
  return v && Number.isFinite(n) ? n.toLocaleString("en-US") : v;
};

/** Log one coat & print run (internal only). Tablet-friendly, like the daily production entry. */
export default function PrintRunForm({
  today,
  orders,
  coatings,
  lacquers,
}: {
  today: string;
  orders: PrintOrder[];
  /** Coatings and lacquers used before, offered as suggestions. */
  coatings: string[];
  lacquers: string[];
}) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const order = orders.find((o) => o.id === orderId);
  const [printed, setPrinted] = useState("");
  const [spoiled, setSpoiled] = useState("");
  const [perSheet, setPerSheet] = useState(order?.perSheet ? String(order.perSheet) : "");
  const [state, action, pending] = useActionState<PrintRunState, FormData>(async (prev, fd) => {
    const res = await savePrintRun(prev, fd);
    // Saved: keep the order, shift, coating and settings for the next run.
    if (res?.ok) {
      setPrinted("");
      setSpoiled("");
    }
    return res;
  }, null);

  const choose = (id: string) => {
    setOrderId(id);
    const next = orders.find((o) => o.id === id);
    if (next?.perSheet) setPerSheet(String(next.perSheet));
  };

  const p = Number.isFinite(wholeNumber(printed)) ? wholeNumber(printed) : 0;
  const sp = Number.isFinite(wholeNumber(spoiled)) ? wholeNumber(spoiled) : 0;
  const ps = Number.isFinite(wholeNumber(perSheet)) ? wholeNumber(perSheet) : 0;
  const seg = "seg-opt min-h-[52px] flex-1 justify-center text-[15px]";
  const big = "input !min-h-[56px] text-[22px] font-extrabold";

  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div className="flex justify-end">
        <InternalOnly>Internal only · customers never see print runs</InternalOnly>
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

      <Field label="Order" htmlFor="pr-order">
        <select id="pr-order" name="order_id" required value={orderId} onChange={(e) => choose(e.target.value)} className="input !min-h-[52px] text-[16px]">
          {orders.length === 0 && <option value="">No confirmed orders to print for</option>}
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {order && (
        <fieldset className="field m-0 border-0 p-0" key={order.id}>
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">Colours printed</legend>
          {order.colours.length === 0 ? (
            <p className="m-0 text-[13px] opacity-70">No colours on file for this brand. Add them under Customers.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {order.colours.map((c) => {
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Good sheets" htmlFor="pr-printed">
          <input id="pr-printed" name="sheets_printed" inputMode="numeric" autoComplete="off" value={fmt(printed)} onChange={(e) => setPrinted(e.target.value)} placeholder="0" className={big} />
        </Field>
        <Field label="Spoiled sheets" htmlFor="pr-spoiled">
          <input id="pr-spoiled" name="sheets_spoiled" inputMode="numeric" autoComplete="off" value={fmt(spoiled)} onChange={(e) => setSpoiled(e.target.value)} placeholder="0" className={big} />
        </Field>
        <Field label="Crowns per sheet" htmlFor="pr-per">
          <input id="pr-per" name="crowns_per_sheet" inputMode="numeric" autoComplete="off" required value={perSheet} onChange={(e) => setPerSheet(e.target.value)} placeholder="e.g. 400" className={big} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3.5 py-3 text-[14px]">
        <span>
          Spoiled <b>{formatSpoiledPct(p, sp)}</b>
        </span>
        <span>
          Yields about <b>{p && ps ? formatQty(crownsFromSheets(p, ps)) : "-"}</b> crowns
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coating" htmlFor="pr-coating">
          <input id="pr-coating" name="coating" maxLength={100} list="pr-coatings" placeholder="e.g. Gold base coat" className="input min-h-11" />
          <datalist id="pr-coatings">
            {coatings.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Lacquer" htmlFor="pr-lacquer">
          <input id="pr-lacquer" name="lacquer" maxLength={100} list="pr-lacquers" placeholder="e.g. Food-grade inside lacquer" className="input min-h-11" />
          <datalist id="pr-lacquers">
            {lacquers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Oven temperature (°C)" htmlFor="pr-oven">
          <input id="pr-oven" name="oven_temp_c" inputMode="decimal" autoComplete="off" placeholder="e.g. 185" className="input min-h-11" />
        </Field>
        <Field label="Tinplate coil / lot" htmlFor="pr-coil">
          <input id="pr-coil" name="coil_lot" maxLength={60} placeholder="e.g. TP-2291" className="input min-h-11" />
        </Field>
      </div>
      <Field label="Notes (internal)" htmlFor="pr-notes">
        <textarea id="pr-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>

      <FormMessage state={state} />
      <Button type="submit" disabled={pending || !orderId || p + sp === 0 || !ps} icon="✓" className="min-h-[60px] px-5 py-4 text-[17px]">
        {pending ? "Saving…" : "Save run"}
      </Button>
    </form>
  );
}

/** Delete a run entered by mistake. */
export function DeletePrintRunButton({ id }: { id: string }) {
  return (
    <form
      action={deletePrintRun}
      onSubmit={(e) => {
        if (!confirm("Delete this print run?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label="Delete this print run" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
        Delete
      </button>
    </form>
  );
}

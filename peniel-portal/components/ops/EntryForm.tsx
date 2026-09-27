"use client";

import { usePlant } from "@/components/PlantSettings";
import { useActionState, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { saveEntry, type ProductionState } from "@/app/ops/production/actions";
import { Button, FormMessage } from "@/components/ui/form";
import { InternalOnly, CustomerSees } from "@/components/ui/Visibility";
import { formatQty } from "@/lib/format";
import { rejectPct, SHIFTS } from "@/lib/production-math";

export type EntryOrder = { id: string; label: string; quantity: number; good: number; brand_id: string | null; brand: string };
/** A finished stillage at a press, not used up yet. */
export type EntryStillage = { id: string; label: string; brand_id: string; press: string; since: string; sheets: number; entries: number };

const digits = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const fmt = (v: string) => (v ? Number(v).toLocaleString("en-US") : "");

function Stepper({
  id,
  name,
  value,
  onChange,
  step,
  label,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  label: string;
}) {
  const n = Number(value || 0);
  const btn = "grid min-h-16 cursor-pointer place-items-center border-0 bg-surface text-[22px] text-text hover:bg-neutral-200";
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] border border-divider">
      <button type="button" className={btn} aria-label={`${label}: minus ${step.toLocaleString("en-US")}`} onClick={() => onChange(String(Math.max(0, n - step)))}>
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={fmt(value)}
        placeholder="0"
        onChange={(e) => onChange(digits(e.target.value))}
        className="input !min-h-16 !border-0 text-center text-[28px] font-extrabold"
      />
      <input type="hidden" name={name} value={value || "0"} />
      <button type="button" className={btn} aria-label={`${label}: plus ${step.toLocaleString("en-US")}`} onClick={() => onChange(String(n + step))}>
        +
      </button>
    </div>
  );
}

/** Daily production entry for the tablet on the floor (design 1g). */
export default function EntryForm({
  today,
  lines,
  orders,
  stillages,
}: {
  today: string;
  lines: { id: string; name: string; status?: string }[];
  orders: EntryOrder[];
  stillages: EntryStillage[];
}) {
  const { reject_limit_pct: REJECT_LIMIT_PCT } = usePlant();
  const [produced, setProduced] = useState("");
  const [rejects, setRejects] = useState("");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  // The printed stillages pressed from (one is picked for you when it's the only one), and those now used up.
  const brandStillages = (id: string) => stillages.filter((s) => s.brand_id === orders.find((o) => o.id === id)?.brand_id);
  const firstPick = (id: string) => {
    const list = brandStillages(id);
    return list.length === 1 ? [list[0].id] : [];
  };
  const [picked, setPicked] = useState<string[]>(() => firstPick(orders[0]?.id ?? ""));
  const [usedUp, setUsedUp] = useState<string[]>([]);
  const chooseOrder = (id: string) => {
    setOrderId(id);
    setPicked(firstPick(id));
    setUsedUp([]);
  };
  const togglePick = (id: string, on: boolean) => {
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
    if (!on) setUsedUp((u) => u.filter((x) => x !== id));
  };
  // Cancel: start the form again (nothing is saved).
  const [formKey, setFormKey] = useState(0);
  const cancel = () => {
    setProduced("");
    setRejects("");
    chooseOrder(orders[0]?.id ?? "");
    setFormKey((k) => k + 1);
  };
  const [state, action, pending] = useActionState<ProductionState, FormData>(async (prev, fd) => {
    const res = await saveEntry(prev, fd);
    if (res?.ok) {
      setProduced("");
      setRejects("");
      // Used-up stillages drop off the list after the page refreshes.
      setPicked((p) => p.filter((x) => !usedUp.includes(x)));
      setUsedUp([]);
    }
    return res;
  }, null);

  const p = Number(produced || 0);
  const r = Number(rejects || 0);
  const pct = rejectPct(r, p);
  const order = orders.find((o) => o.id === orderId);
  const seg = "seg-opt min-h-[52px] flex-1 justify-center text-[15px]";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-[18px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="entry-date">Date</label>
          <input id="entry-date" name="entry_date" type="date" defaultValue={today} max={today} required className="input !min-h-[52px] text-[16px]" />
        </div>
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

      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] flex w-full justify-between p-0 text-[12px] text-text/70">
          Line
          <InternalOnly />
        </legend>
        <div className="seg !flex flex-wrap">
          {lines.map((l, i) => (
            <label key={l.id} className={seg}>
              <input type="radio" name="line_id" value={l.id} defaultChecked={i === 0} required />
              {l.name}
              {l.status && l.status !== "running" && <span className="text-[11px] font-normal opacity-70">({l.status})</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="entry-order">Order</label>
        <select
          id="entry-order"
          name="order_id"
          required
          value={orderId}
          onChange={(e) => chooseOrder(e.target.value)}
          className="input !min-h-[52px] text-[16px]"
        >
          {orders.length === 0 && <option value="">No confirmed orders to produce</option>}
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] flex w-full justify-between p-0 text-[12px] text-text/70">
          Printed sheets pressed (stillages at the press{order ? ` · ${order.brand}` : ""})
          <InternalOnly />
        </legend>
        {order && brandStillages(orderId).length === 0 ? (
          <p className="m-0 border-2 border-accent bg-accent-100 px-3.5 py-3 text-[14px] text-accent-800">
            No {order.brand} stillage is at a press. On <Link href="/ops/production/sheets" className="font-extrabold">Printed sheets</Link>, send a finished stillage to
            the press first, then log this entry.
          </p>
        ) : (
          <div className="flex flex-col border border-divider">
            {brandStillages(orderId).map((s) => {
              const on = picked.includes(s.id);
              return (
                <div key={s.id} className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-3.5 py-2.5 last:border-b-0", on && "bg-accent-100")}>
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-[15px]">
                    <input type="checkbox" name="stillage" value={s.id} checked={on} onChange={(e) => togglePick(s.id, e.target.checked)} className="size-6 accent-[var(--color-accent)]" />
                    <span>
                      <b>{s.label}</b> · {s.sheets.toLocaleString("en-US")} sheets
                      <span className="block text-[12px] opacity-70">
                        At {s.press} since {s.since}
                        {s.entries ? ` · used in ${s.entries} ${s.entries === 1 ? "entry" : "entries"} so far` : " · not used yet"}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        name="used_up"
                        value={s.id}
                        checked={usedUp.includes(s.id)}
                        onChange={(e) => setUsedUp((u) => (e.target.checked ? [...u, s.id] : u.filter((x) => x !== s.id)))}
                        className="size-5 accent-[var(--color-accent)]"
                      />
                      All sheets used (used up)
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="produced" className="!flex justify-between gap-2">
            Crowns produced
            <CustomerSees>Customer sees total per order</CustomerSees>
          </label>
          <Stepper id="produced" name="produced" value={produced} onChange={setProduced} step={1000} label="Crowns produced" />
        </div>
        <div className="field">
          <label htmlFor="rejects" title="Crowns the liner camera pushed out. They go to sorting.">
            Camera rejects
            <InternalOnly>Internal · goes to sorting</InternalOnly>
          </label>
          <Stepper id="rejects" name="rejects" value={rejects} onChange={setRejects} step={10} label="Camera rejects" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3.5 py-3 text-[14px]">
        <span className={clsx(pct > REJECT_LIMIT_PCT && "font-extrabold text-accent-700")}>
          Camera reject rate <b>{p ? `${pct.toFixed(2)}%` : "-"}</b> · limit {REJECT_LIMIT_PCT.toFixed(2)}%
        </span>
        {order && (
          <span>
            Order total after save{" "}
            <b>
              {formatQty(order.good + Math.max(0, p - r))} / {formatQty(order.quantity)}
            </b>
          </span>
        )}
      </div>

      <FormMessage state={state} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] gap-3">
        <Button type="button" variant="secondary" onClick={cancel} disabled={pending} icon="✕" className="min-h-[60px] px-5 py-4 text-[17px] text-text">
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !p || r > p || !orderId || picked.length === 0} icon="✓" className="min-h-[60px] px-5 py-4 text-[17px]">
          {pending ? "Saving…" : "Save entry"}
        </Button>
      </div>
      <p className="m-0 text-[12px] opacity-70">
        Lines stay internal. The customer portal adds up entries by order and day, and only after Production publishes
        them.
      </p>
    </form>
  );
}

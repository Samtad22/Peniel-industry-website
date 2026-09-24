"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { saveEntry, type ProductionState } from "@/app/ops/production/actions";
import { Button, FormMessage } from "@/components/ui/form";
import { InternalOnly, CustomerSees } from "@/components/ui/Visibility";
import { formatQty } from "@/lib/format";
import { rejectPct, REJECT_LIMIT_PCT, SHIFTS } from "@/lib/production-math";

export type EntryOrder = { id: string; label: string; quantity: number; good: number };

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
}: {
  today: string;
  lines: { id: string; name: string }[];
  orders: EntryOrder[];
}) {
  const [produced, setProduced] = useState("");
  const [rejects, setRejects] = useState("");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [state, action, pending] = useActionState<ProductionState, FormData>(async (prev, fd) => {
    const res = await saveEntry(prev, fd);
    if (res?.ok) {
      setProduced("");
      setRejects("");
    }
    return res;
  }, null);

  const p = Number(produced || 0);
  const r = Number(rejects || 0);
  const pct = rejectPct(r, p);
  const order = orders.find((o) => o.id === orderId);
  const seg = "seg-opt min-h-[52px] flex-1 justify-center text-[15px]";

  return (
    <form action={action} className="flex flex-col gap-[18px]">
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
          onChange={(e) => setOrderId(e.target.value)}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="produced" className="!flex justify-between gap-2">
            Crowns produced
            <CustomerSees>Customer sees total per order</CustomerSees>
          </label>
          <Stepper id="produced" name="produced" value={produced} onChange={setProduced} step={1000} label="Crowns produced" />
        </div>
        <div className="field">
          <label htmlFor="rejects">Rejects</label>
          <Stepper id="rejects" name="rejects" value={rejects} onChange={setRejects} step={10} label="Rejects" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3.5 py-3 text-[14px]">
        <span className={clsx(pct > REJECT_LIMIT_PCT && "font-extrabold text-accent-700")}>
          Reject rate <b>{p ? `${pct.toFixed(2)}%` : "—"}</b> · limit {REJECT_LIMIT_PCT.toFixed(2)}%
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
      <Button type="submit" disabled={pending || !p || r > p || !orderId} icon="✓" className="min-h-[60px] px-5 py-4 text-[17px]">
        {pending ? "Saving…" : "Save entry"}
      </Button>
      <p className="m-0 text-[12px] opacity-70">
        Lines stay internal. The customer portal adds up entries by order and day, and only after Production publishes
        them.
      </p>
    </form>
  );
}

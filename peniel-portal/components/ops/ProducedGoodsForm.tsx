"use client";

import { useActionState, useState } from "react";
import { deleteProducedGoods, saveProducedGoods, type GoodsState } from "@/app/ops/production/goods/actions";
import ConfirmForm from "@/components/ui/ConfirmForm";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { batchKey, CROWNS_PER_CARTON, parseGoodsQuantity } from "@/lib/produced-goods";

/** An order produced goods can be recorded for, with the batches inspected so far. */
export type GoodsOrder = { id: string; label: string; batches: { batch_no: string; certificate: boolean }[] };
/** An entry being corrected. */
export type GoodsEntry = { id: string; order_id: string; batch_no: string; quantity: number; produced_on: string; notes: string | null };

const n = (x: number) => x.toLocaleString("en-US");

/**
 * Record the crowns produced for a batch of an order. The batch's
 * Certificate of Analysis shows the total recorded for it (internal form).
 */
export function ProducedGoodsForm({
  orders,
  totals,
  today,
  entry,
  close,
}: {
  orders: GoodsOrder[];
  /** Crowns already recorded, by `${order_id}|${batchKey(batch)}`. */
  totals: Record<string, number>;
  today: string;
  entry?: GoodsEntry;
  close?: () => void;
}) {
  const [state, action, pending] = useActionState<GoodsState, FormData>(saveProducedGoods, null);
  const [orderId, setOrderId] = useState(entry?.order_id ?? "");
  const [batch, setBatch] = useState(entry?.batch_no ?? "");
  const [unit, setUnit] = useState<"crowns" | "cartons">(entry && entry.quantity % CROWNS_PER_CARTON === 0 ? "cartons" : "crowns");
  const [qty, setQty] = useState(entry ? n(unit === "cartons" ? entry.quantity / CROWNS_PER_CARTON : entry.quantity) : "");
  // After a new entry is saved, clear the quantity so it isn't saved twice.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok && !entry) setQty("");
  }
  const order = orders.find((o) => o.id === orderId);
  const crowns = parseGoodsQuantity(qty, unit);
  const key = `${orderId}|${batchKey(batch)}`;
  // What is already recorded for this batch, without the entry being corrected.
  const before = (totals[key] ?? 0) - (entry && `${entry.order_id}|${batchKey(entry.batch_no)}` === key ? entry.quantity : 0);
  const inspected = order?.batches.find((b) => batchKey(b.batch_no) === batchKey(batch));
  const p = entry ? `pg-${entry.id.slice(0, 8)}` : "pg";

  return (
    <form action={action} className="flex flex-col gap-3.5">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <Field label="Order" htmlFor={`${p}-order`}>
        <select id={`${p}-order`} name="order_id" required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input min-h-11">
          <option value="">Choose the order</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Batch number" htmlFor={`${p}-batch`}>
          <input
            id={`${p}-batch`}
            name="batch_no"
            required
            maxLength={40}
            autoComplete="off"
            list={`${p}-batches`}
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder={order?.batches[0]?.batch_no ?? "e.g. B-0142"}
            className="input min-h-11"
          />
          <datalist id={`${p}-batches`}>
            {(order?.batches ?? []).map((b) => (
              <option key={b.batch_no} value={b.batch_no} />
            ))}
          </datalist>
        </Field>
        <Field label="Date produced" htmlFor={`${p}-date`}>
          <input id={`${p}-date`} name="produced_on" type="date" required max={today} defaultValue={entry?.produced_on ?? today} className="input min-h-11" />
        </Field>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Quantity produced (good crowns)" htmlFor={`${p}-qty`}>
          <input
            id={`${p}-qty`}
            name="quantity"
            inputMode="decimal"
            required
            autoComplete="off"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={unit === "cartons" ? "e.g. 125" : "e.g. 1,250,000"}
            className="input !min-h-[52px] text-[20px] font-extrabold"
          />
        </Field>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">In</legend>
          <div className="seg !flex">
            {(["crowns", "cartons"] as const).map((u) => (
              <label key={u} className="seg-opt min-h-[52px] flex-1 justify-center px-4">
                <input type="radio" name="qty_unit" value={u} checked={unit === u} onChange={() => setUnit(u)} />
                {u === "crowns" ? "Crowns" : "Cartons"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="m-0 text-[13px] opacity-80" aria-live="polite">
        {Number.isFinite(crowns) ? (
          <>
            = <b>{n(crowns)} crowns</b>
            {unit === "crowns" && crowns % CROWNS_PER_CARTON === 0 ? ` (${n(crowns / CROWNS_PER_CARTON)} cartons)` : ""}
            {unit === "cartons" ? ` (${CROWNS_PER_CARTON.toLocaleString("en-US")} a carton)` : ""}
            {before > 0 ? (
              <>
                {" "}
                · with the {n(before)} already recorded, the batch comes to <b>{n(before + crowns)}</b>
              </>
            ) : null}
          </>
        ) : before > 0 ? (
          <>Already recorded for this batch: {n(before)} crowns. A new entry adds to it.</>
        ) : (
          "Several entries for one batch add up."
        )}
      </p>
      {orderId && batch.trim() && (
        <p className="m-0 border-l-[3px] border-text py-1 pl-3 text-[12px] opacity-80">
          {inspected
            ? inspected.certificate
              ? "This batch's certificate is ready: it will show the batch total as its Quantity."
              : "This batch is inspected: its certificate will show the batch total as its Quantity."
            : "No inspection with this batch number on this order yet. The certificate shows the quantity once the batch is inspected under the same number."}
        </p>
      )}
      <Field label="Notes (internal)" htmlFor={`${p}-notes`}>
        <textarea id={`${p}-notes`} name="notes" maxLength={1000} defaultValue={entry?.notes ?? ""} placeholder="e.g. counted at packing, 2 pallets" className="input !min-h-[48px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {state?.ok ? "Done" : "Cancel"}
          </Button>
        )}
        {!(close && state?.ok) && (
          <Button type="submit" disabled={pending || !Number.isFinite(crowns)} icon="✓" className="w-[200px]">
            {pending ? "Saving…" : entry ? "Save the change" : "Record produced goods"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Correct an entry. */
export function EditProducedGoods({ orders, totals, today, entry }: { orders: GoodsOrder[]; totals: Record<string, number>; today: string; entry: GoodsEntry }) {
  return (
    <Modal
      title="Correct produced goods"
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2">
          Edit
        </button>
      )}
    >
      {(close) => <ProducedGoodsForm orders={orders} totals={totals} today={today} entry={entry} close={close} />}
    </Modal>
  );
}

/** Admin: remove an entry made by mistake. */
export function DeleteProducedGoods({ id }: { id: string }) {
  return <ConfirmForm action={deleteProducedGoods} fields={{ id }} message="Delete this produced goods entry? The batch's certificate total goes down by it." label="Delete" />;
}

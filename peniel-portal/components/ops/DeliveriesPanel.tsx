"use client";

import { useActionState, useState } from "react";
import { addDelivery, deleteDelivery, type DeliveryState } from "@/app/ops/orders/delivery-actions";
import ConfirmForm from "@/components/ui/ConfirmForm";
import Modal from "@/components/ui/Modal";
import { CustomerSees } from "@/components/ui/Visibility";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { cartonsLabel, deliveryTotals, DELIVERY_KIND, parseDeliveryQuantity, sortDeliveries, type Delivery, type DeliveryKind } from "@/lib/deliveries";
import { formatDate } from "@/lib/format";

const n = (x: number) => x.toLocaleString("en-US");

/**
 * An order's deliveries (DOs): ordered, delivered, remaining, and the list.
 * Admin, sales and warehouse record them; admin deletes. The customer sees
 * the same figures and DOs on their order (not the notes).
 */
export default function DeliveriesPanel({
  orderId,
  ordered,
  deliveries,
  canRecord,
  canDelete,
  today,
}: {
  orderId: string;
  ordered: number;
  deliveries: Delivery[];
  canRecord: boolean;
  canDelete: boolean;
  today: string;
}) {
  const t = deliveryTotals(ordered, deliveries);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[26px] sm:text-[30px]">Deliveries</h2>
        <span className="flex items-center gap-3">
          <CustomerSees />
          {canRecord && <AddDeliveryDialog orderId={orderId} today={today} />}
        </span>
      </div>
      <div className="grid grid-cols-3 border-y-2 border-text">
        {[
          ["Ordered", t.ordered],
          ["Delivered", t.delivered],
          ["Remaining", t.remaining],
        ].map(([label, v], i) => (
          <div key={label} className={`px-3 py-3 ${i ? "border-l border-divider" : ""}`}>
            <span className="font-mono text-[11px] font-semibold tracking-[.1em] opacity-60">{String(label).toUpperCase()}</span>
            <div className="text-[22px] font-extrabold leading-tight tracking-[-.02em] tabular-nums sm:text-[26px]">{n(Number(v))}</div>
            <span className="text-[12px] opacity-65">{cartonsLabel(Number(v))}</span>
          </div>
        ))}
      </div>
      <div className="h-2 bg-neutral-200" aria-hidden="true">
        <div className="h-full bg-text" style={{ width: `${t.pct}%` }} />
      </div>
      {t.over > 0 && <p className="m-0 mt-1 text-[12px] font-extrabold text-accent-800">{n(t.over)} crowns more than ordered.</p>}
      {t.returnExchange > 0 && (
        <p className="m-0 mt-1 text-[12px] opacity-75">
          Return exchanges (sorted and sent back, not counted again): {n(t.returnExchange)} crowns, {cartonsLabel(t.returnExchange)}.
        </p>
      )}
      <div className="mt-2 text-[13px]">
        {deliveries.length === 0 && <p className="m-0 py-2 opacity-60">No deliveries recorded yet.</p>}
        {sortDeliveries(deliveries).map((d) => (
          <div key={d.id} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-3 border-b border-divider py-2">
            <span className="opacity-75">{d.delivered_on ? formatDate(d.delivered_on) : "No date"}</span>
            <span className="min-w-0">
              <b>{d.do_no ? `DO ${d.do_no}` : "No DO"}</b>
              {d.kind === "return_exchange" && <span className="ml-2 bg-neutral-200 px-1.5 py-0.5 text-[11px] font-extrabold">RE · not counted</span>}
              {d.notes && <span className="block truncate text-[12px] opacity-60">{d.notes}</span>}
            </span>
            <span className="flex items-baseline gap-3 text-right">
              <span className="tabular-nums">
                <b>{cartonsLabel(Number(d.quantity))}</b>
                <span className="block text-[11px] opacity-60">{n(Number(d.quantity))}</span>
              </span>
              {canDelete && (
                <ConfirmForm
                  action={deleteDelivery}
                  fields={{ id: d.id, order_id: orderId }}
                  message={`Delete ${d.do_no ? `DO ${d.do_no}` : "this delivery"} (${cartonsLabel(Number(d.quantity))})? The customer's delivered figure changes with it.`}
                  label="Delete"
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddDeliveryDialog({ orderId, today }: { orderId: string; today: string }) {
  return (
    <Modal
      title="Record a delivery"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="+" className="text-text">
          Record a delivery
        </Button>
      )}
    >
      {(close) => <AddDeliveryForm orderId={orderId} today={today} close={close} />}
    </Modal>
  );
}

function AddDeliveryForm({ orderId, today, close }: { orderId: string; today: string; close: () => void }) {
  const [state, action, pending] = useActionState<DeliveryState, FormData>(addDelivery, null);
  const [unit, setUnit] = useState<"cartons" | "crowns">("cartons");
  const [qty, setQty] = useState("");
  const [kind, setKind] = useState<DeliveryKind>("delivery");
  const crowns = parseDeliveryQuantity(qty, unit);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="order_id" value={orderId} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="DO number" htmlFor="dl-do">
          <input id="dl-do" name="do_no" required maxLength={40} autoComplete="off" placeholder="e.g. 35" className="input min-h-11" />
        </Field>
        <Field label="Date delivered" htmlFor="dl-date">
          <input id="dl-date" name="delivered_on" type="date" required max={today} defaultValue={today} className="input min-h-11" />
        </Field>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Quantity" htmlFor="dl-qty">
          <input
            id="dl-qty"
            name="quantity"
            inputMode="decimal"
            required
            autoComplete="off"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={unit === "cartons" ? "e.g. 190" : "e.g. 1,900,000"}
            className="input !min-h-[52px] text-[20px] font-extrabold"
          />
        </Field>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">In</legend>
          <div className="seg !flex">
            {(["cartons", "crowns"] as const).map((u) => (
              <label key={u} className="seg-opt min-h-[52px] flex-1 justify-center px-4">
                <input type="radio" name="qty_unit" value={u} checked={unit === u} onChange={() => setUnit(u)} />
                {u === "cartons" ? "Cartons" : "Crowns"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {Number.isFinite(crowns) && <p className="m-0 text-[13px] opacity-80">= <b>{n(crowns)} crowns</b> ({cartonsLabel(crowns)})</p>}
      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] p-0 text-[12px] text-text/70">Type</legend>
        <div className="seg !flex">
          {(Object.keys(DELIVERY_KIND) as DeliveryKind[]).map((k) => (
            <label key={k} className="seg-opt min-h-11 flex-1 justify-center px-3 text-center">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              {DELIVERY_KIND[k]}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "return_exchange" && (
        <p className="m-0 border-l-[3px] border-text py-1 pl-3 text-[12px] opacity-80">
          Crowns delivered before, returned by the customer, sorted and sent back. Listed on the order, not counted as delivered again.
        </p>
      )}
      <Field label="Notes (internal)" htmlFor="dl-notes">
        <textarea id="dl-notes" name="notes" maxLength={1000} placeholder="e.g. light and dark artwork sorted" className="input !min-h-[48px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending || !Number.isFinite(crowns)} icon="✓" className="w-[170px]">
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </form>
  );
}

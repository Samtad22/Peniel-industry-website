"use client";

import { useActionState } from "react";
import { addLot, deleteLot, type InvState } from "@/app/ops/inventory/actions";
import ConfirmForm from "@/components/ui/ConfirmForm";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import type { LotInStock, MaterialLot } from "@/lib/material-lots";

const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * A material's deliveries (lots) with production and expiry dates, and how
 * much of each is still on hand (oldest used first). Admin, warehouse and
 * production add; admin deletes. Internal.
 */
export function LotsDialog({
  material,
  lots,
  inStock,
  today,
  canAdd,
  canDelete,
}: {
  material: { id: string; name: string; unit: string };
  lots: MaterialLot[];
  /** The lots with stock left (from lotStock). */
  inStock: LotInStock[];
  today: string;
  canAdd: boolean;
  canDelete: boolean;
}) {
  const left = new Map(inStock.map((l) => [l.id, l.inStock]));
  const sorted = [...lots].sort((a, b) => (b.received_on ?? b.produced_on ?? "").localeCompare(a.received_on ?? a.produced_on ?? ""));
  return (
    <Modal
      wide
      title={`${material.name} · dates`}
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 opacity-80">
          Dates{lots.length ? ` (${lots.length})` : ""}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[12px] opacity-75">Each delivery with its production and expiry date. Stock is used oldest first, so what is on hand is the newest deliveries.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[620px] text-[13px]">
              <div className="th-row grid grid-cols-[100px_100px_100px_110px_100px_minmax(0,1fr)] gap-2 border-b border-divider py-2">
                <span>Received</span>
                <span className="text-right">Quantity</span>
                <span>Made</span>
                <span>Expires</span>
                <span className="text-right">On hand</span>
                <span />
              </div>
              {sorted.length === 0 && <p className="m-0 py-3 opacity-60">No dates yet.</p>}
              {sorted.map((l) => {
                const now = left.get(l.id) ?? 0;
                const expired = l.expires_on != null && l.expires_on < today;
                return (
                  <div key={l.id} className={`grid grid-cols-[100px_100px_100px_110px_100px_minmax(0,1fr)] items-start gap-2 border-b border-divider py-2 ${now > 0 && expired ? "bg-accent-100" : ""}`}>
                    <span>{formatDate(l.received_on)}</span>
                    <span className="text-right tabular-nums">
                      {n(Number(l.quantity))} {material.unit}
                    </span>
                    <span>{formatDate(l.produced_on)}</span>
                    <span className={expired ? "font-extrabold text-accent-800" : ""}>
                      {formatDate(l.expires_on)}
                      {expired && <span className="block text-[11px]">expired</span>}
                    </span>
                    <span className={`text-right tabular-nums ${now > 0 ? "font-bold" : "opacity-50"}`}>{now > 0 ? `${n(now)} ${material.unit}` : "used up"}</span>
                    <span className="flex min-w-0 items-start justify-between gap-2 text-[12px]">
                      <span className="min-w-0 opacity-70">{[l.lot_no && `Lot ${l.lot_no}`, l.notes].filter(Boolean).join(" · ")}</span>
                      {canDelete && <ConfirmForm action={deleteLot} fields={{ id: l.id }} message="Delete these dates? The stock doesn't change." label="Delete" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {canAdd && <AddLotForm material={material} today={today} />}
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddLotForm({ material, today }: { material: { id: string; unit: string }; today: string }) {
  const [state, action, pending] = useActionState<InvState, FormData>(addLot, null);
  return (
    <form action={action} className="flex flex-col gap-3 border-t-2 border-text pt-3">
      <h4 className="m-0 text-[15px]">Add the dates of a delivery</h4>
      <input type="hidden" name="material_id" value={material.id} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="field">
          <label htmlFor="lot-recv">Received</label>
          <input id="lot-recv" name="received_on" type="date" max={today} defaultValue={today} className="input" />
        </div>
        <div className="field">
          <label htmlFor="lot-qty">Quantity ({material.unit})</label>
          <input id="lot-qty" name="quantity" inputMode="decimal" required className="input" />
        </div>
        <div className="field">
          <label htmlFor="lot-prod">Production date</label>
          <input id="lot-prod" name="produced_on" type="date" className="input" />
        </div>
        <div className="field">
          <label htmlFor="lot-exp">Expiry date</label>
          <input id="lot-exp" name="expires_on" type="date" className="input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="field">
          <label htmlFor="lot-no">Lot no. (optional)</label>
          <input id="lot-no" name="lot_no" maxLength={60} className="input" />
        </div>
        <div className="field">
          <label htmlFor="lot-notes">Note (optional)</label>
          <input id="lot-notes" name="notes" maxLength={300} placeholder="e.g. invoice PK/26019-1" className="input" />
        </div>
      </div>
      <p className="m-0 text-[12px] opacity-70">This only records the dates. To add the stock itself, use &ldquo;Record material in / out&rdquo; (it can take the dates too).</p>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending} icon="+" className="w-[170px]">
          {pending ? "Saving…" : "Add the dates"}
        </Button>
      </div>
    </form>
  );
}

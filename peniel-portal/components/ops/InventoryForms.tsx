"use client";

import { useActionState, useState } from "react";
import {
  proposePickupTime,
  receiveStock,
  recordCollection,
  recordMaterial,
  setStockStatus,
  type InvState,
} from "@/app/ops/inventory/actions";
import { CustomerWarning } from "@/components/ops/OrderForms";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import type { StockStatus } from "@/lib/inventory";

type Opt = { id: string; name: string };

function StatusFields({ status, setStatus, reason, setReason, prefix }: { status: StockStatus; setStatus: (s: StockStatus) => void; reason: string; setReason: (r: string) => void; prefix: string }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${prefix}-status`} className="!flex justify-between gap-2">
          Status
          <CustomerSees />
        </label>
        <select id={`${prefix}-status`} name="status" value={status} onChange={(e) => setStatus(e.target.value as StockStatus)} className="input">
          <option value="available">Available for pickup</option>
          <option value="reserved">Reserved for dispatch</option>
          <option value="on_hold">On hold (QC)</option>
        </select>
      </div>
      {status === "on_hold" && (
        <>
          <div className="field">
            <label htmlFor={`${prefix}-reason`} className="!flex justify-between gap-2">
              Customer-facing reason
              <CustomerSees />
            </label>
            <textarea id={`${prefix}-reason`} name="customer_reason" required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="input !min-h-[64px]" />
          </div>
          <CustomerWarning />
        </>
      )}
    </>
  );
}

export function ReceiveStockDialog({
  companies,
  brands,
  orders,
}: {
  companies: Opt[];
  brands: (Opt & { company_id: string })[];
  orders: (Opt & { company_id: string; brand_id: string })[];
}) {
  const [state, action, pending] = useActionState<InvState, FormData>(receiveStock, null);
  const [companyId, setCompanyId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState<StockStatus>("available");
  const [reason, setReason] = useState("");
  return (
    <Modal title="Receive finished stock" trigger={(open) => <Button type="button" onClick={open}>+ Receive stock</Button>}>
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <div className="field">
            <label htmlFor="rs-company">Customer</label>
            <select id="rs-company" name="company_id" required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setBrandId(""); }} className="input">
              <option value="">Choose a customer</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="rs-brand">Brand</label>
              <select id="rs-brand" name="brand_id" required value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={!companyId} className="input">
                <option value="">Choose</option>
                {brands.filter((b) => b.company_id === companyId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rs-order">For order</label>
              <select id="rs-order" name="order_id" disabled={!brandId} className="input">
                <option value="">None</option>
                {orders.filter((o) => o.brand_id === brandId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="rs-batch">Batch</label>
              <input id="rs-batch" name="batch_no" required maxLength={40} className="input" />
            </div>
            <div className="field">
              <label htmlFor="rs-qty">Quantity (crowns)</label>
              <input id="rs-qty" name="quantity" inputMode="numeric" required className="input" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rs-loc" className="!flex justify-between gap-2">
              Location
              <InternalOnly />
            </label>
            <input id="rs-loc" name="location" maxLength={80} placeholder="e.g. FG-2 Bay 4" className="input" />
          </div>
          <StatusFields prefix="rs" status={status} setStatus={setStatus} reason={reason} setReason={setReason} />
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>{state?.ok ? "Done" : "Cancel"}</Button>
            <Button type="submit" disabled={pending} icon="↓" className="w-[170px]">{pending ? "Saving…" : "Receive"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function StockStatusDialog({ id, label, status: initial, reason: initialReason, location }: { id: string; label: string; status: StockStatus; reason: string; location: string }) {
  const [state, action, pending] = useActionState<InvState, FormData>(setStockStatus, null);
  const [status, setStatus] = useState<StockStatus>(initial);
  const [reason, setReason] = useState(initialReason);
  return (
    <Modal title={`Batch ${label}`} trigger={(open) => <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline">Edit</button>}>
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <StatusFields prefix={`st-${id}`} status={status} setStatus={setStatus} reason={reason} setReason={setReason} />
          <div className="field">
            <label htmlFor={`st-${id}-loc`} className="!flex justify-between gap-2">
              Location
              <InternalOnly />
            </label>
            <input id={`st-${id}-loc`} name="location" defaultValue={location} maxLength={80} className="input" />
          </div>
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>{state?.ok ? "Done" : "Cancel"}</Button>
            <Button type="submit" disabled={pending} icon="✓" className="w-[150px]">{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function MaterialDialog({ materials }: { materials: (Opt & { unit: string })[] }) {
  const [state, action, pending] = useActionState<InvState, FormData>(recordMaterial, null);
  return (
    <Modal title="Record raw material" trigger={(open) => <Button type="button" variant="secondary" onClick={open} className="text-text">Record material in / out</Button>}>
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <div className="field">
            <label htmlFor="rm-mat">Material</label>
            <select id="rm-mat" name="material_id" required className="input">
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <fieldset className="field m-0 border-0 p-0">
              <legend className="mb-[5px] p-0 text-[12px] text-text/70">Movement</legend>
              <div className="seg !flex">
                <label className="seg-opt flex-1 justify-center"><input type="radio" name="direction" value="in" defaultChecked />In</label>
                <label className="seg-opt flex-1 justify-center"><input type="radio" name="direction" value="out" />Out</label>
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="rm-qty">Quantity</label>
              <input id="rm-qty" name="quantity" inputMode="decimal" required className="input" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rm-reason">Reason</label>
            <input id="rm-reason" name="reason" required maxLength={200} placeholder="e.g. Delivery received · issued to Line 2" className="input" />
          </div>
          <p className="m-0 text-[12px] opacity-70">Internal only. Raw materials never reach the customer portal.</p>
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>{state?.ok ? "Done" : "Cancel"}</Button>
            <Button type="submit" disabled={pending} icon="✓" className="w-[150px]">{pending ? "Saving…" : "Record"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ProposeTimeForm({ id, min }: { id: string; min: string }) {
  const [state, action, pending] = useActionState<InvState, FormData>(proposePickupTime, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label htmlFor={`pt-${id}`}>Suggest another time</label>
        <input id={`pt-${id}`} name="proposed_time" type="datetime-local" min={min} required className="input min-h-11" />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} icon="↻" className="min-h-11 text-text">
        {pending ? "Sending…" : "Propose"}
      </Button>
      <div className="basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CollectionForm({ id, suggestedNote }: { id: string; suggestedNote: string }) {
  const [state, action, pending] = useActionState<InvState, FormData>(recordCollection, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label htmlFor="rc-vehicle">Vehicle plate</label>
        <input id="rc-vehicle" name="vehicle" maxLength={40} className="input min-h-11 !bg-bg" />
      </div>
      <div className="field">
        <label htmlFor="rc-driver">Driver (name and phone)</label>
        <input id="rc-driver" name="driver" maxLength={80} className="input min-h-11 !bg-bg" />
      </div>
      <div className="field">
        <label htmlFor="rc-dn" className="!flex justify-between gap-2">
          Delivery note no.
          <CustomerSees />
        </label>
        <input id="rc-dn" name="delivery_note_no" required maxLength={40} defaultValue={suggestedNote} className="input min-h-11 !bg-bg" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending || Boolean(state?.ok)} icon="→" className="min-h-12 px-4">
        {pending ? "Recording…" : "Record collection"}
      </Button>
      <p className="m-0 text-[12px] opacity-70">
        Marks these batches as collected. An order that was Ready for pickup with nothing left in stock becomes Delivered.
      </p>
    </form>
  );
}

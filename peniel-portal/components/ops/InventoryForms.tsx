"use client";

import { useActionState, useState } from "react";
import {
  proposePickupTime,
  receiveStock,
  recordCollection,
  recordMaterial,
  saveInkRates,
  saveMaterial,
  setMaterialStock,
  setStockStatus,
  type InvState,
} from "@/app/ops/inventory/actions";
import { CustomerWarning } from "@/components/ops/OrderForms";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { formatGrams, inkFor, type BrandInk } from "@/lib/ink-usage";
import type { StockStatus } from "@/lib/inventory";
import { USE_BASIS, type UseBasis } from "@/lib/materials";

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

export function MaterialDialog({ materials, label = "Record material in / out", preset }: { materials: (Opt & { unit: string })[]; label?: string; preset?: string }) {
  return (
    <Modal title="Record raw material" trigger={(open) => <Button type="button" variant="secondary" onClick={open} className="text-text">{label}</Button>}>
      {(close) => <MaterialForm materials={materials} preset={preset} close={close} />}
    </Modal>
  );
}

function MaterialForm({ materials, preset, close }: { materials: (Opt & { unit: string })[]; preset?: string; close: () => void }) {
  const [state, action, pending] = useActionState<InvState, FormData>(recordMaterial, null);
  const [id, setId] = useState(preset ?? materials[0]?.id ?? "");
  const unit = materials.find((m) => m.id === id)?.unit ?? "";
  // Kept in kg (inks, compound): type it in kg or g.
  const inKg = unit.toLowerCase() === "kg";
  const [qtyUnit, setQtyUnit] = useState<"kg" | "g">("kg");
  return (
        <form action={action} className="flex flex-col gap-3">
          <div className="field">
            <label htmlFor="rm-mat">Material</label>
            <select id="rm-mat" name="material_id" required value={id} onChange={(e) => setId(e.target.value)} className="input">
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
              <label htmlFor="rm-qty">Quantity{inKg ? "" : unit ? ` (${unit})` : ""}</label>
              <div className="flex">
                <input id="rm-qty" name="quantity" inputMode="decimal" required className="input min-w-0 flex-1" />
                {inKg && (
                  <select aria-label="Unit" name="qty_unit" value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value as "kg" | "g")} className="input !w-[72px] shrink-0 border-l-0">
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                )}
              </div>
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

/** Admin: set the stock on hand after a count. */
export function StockCountDialog({ id, name, unit, onHand }: { id: string; name: string; unit: string; onHand: number }) {
  return (
    <Modal
      title={`Stock count · ${name}`}
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 opacity-80">
          Edit stock
        </button>
      )}
    >
      {(close) => <StockCountForm id={id} unit={unit} onHand={onHand} close={close} />}
    </Modal>
  );
}

function StockCountForm({ id, unit, onHand, close }: { id: string; unit: string; onHand: number; close: () => void }) {
  const [state, action, pending] = useActionState<InvState, FormData>(setMaterialStock, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="material_id" value={id} />
      <p className="m-0 text-[13px]">
        Now on record: <b>{onHand.toLocaleString("en-US", { maximumFractionDigits: 3 })} {unit}</b>
      </p>
      <div className="field">
        <label htmlFor="sc-qty">Stock counted ({unit})</label>
        <input id="sc-qty" name="on_hand" inputMode="decimal" required defaultValue={onHand < 0 ? 0 : onHand} className="input" />
      </div>
      <div className="field">
        <label htmlFor="sc-note">Note (optional)</label>
        <input id="sc-note" name="note" maxLength={120} placeholder="e.g. Monthly count" className="input" />
      </div>
      <p className="m-0 text-[12px] opacity-70">The difference is recorded as a stock-count movement, so the history and reports stay complete. Admin only.</p>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="✓" className="w-[150px]">
            {pending ? "Saving…" : "Save count"}
          </Button>
        )}
      </div>
    </form>
  );
}

export type MaterialFields = { id: string; name: string; unit: string; reorder_level: number | null; use_basis: string | null; use_rate: number | null; active?: boolean; ink?: boolean };

/** Add a raw material, or edit it: name, unit, reorder level, and how much is used automatically. */
export function MaterialSettingsDialog({ material }: { material?: MaterialFields }) {
  return (
    <Modal
      title={material ? material.name : "Add a raw material"}
      trigger={(open) =>
        material ? (
          <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 opacity-80">
            Settings
          </button>
        ) : (
          <Button type="button" variant="secondary" onClick={open} icon="+" className="whitespace-nowrap text-text">
            Add a material
          </Button>
        )
      }
    >
      {(close) => <MaterialSettingsForm material={material} close={close} />}
    </Modal>
  );
}

/** A brand and its inks, with the grams per sheet set so far. */
export type InkRateBrand = { id: string; label: string; inks: BrandInk[] };

/** Grams of each ink a sheet of a brand takes: fills in the ink on the print and sample forms. */
export function InkRatesDialog({ brands }: { brands: InkRateBrand[] }) {
  return (
    <Modal
      wide
      title="Ink per sheet, per brand"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} className="whitespace-nowrap text-text">
          Ink per sheet
        </Button>
      )}
    >
      {(close) => <InkRatesForm brands={brands} close={close} />}
    </Modal>
  );
}

function InkRatesForm({ brands, close }: { brands: InkRateBrand[]; close: () => void }) {
  const [state, action, pending] = useActionState<InvState, FormData>(saveInkRates, null);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [rates, setRates] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(brands.map((b) => [b.id, Object.fromEntries(b.inks.map((i) => [i.materialId, i.gPerSheet == null ? "" : String(i.gPerSheet)]))])),
  );
  const mine = rates[brandId] ?? {};
  const sheets = 1420;
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="rates" value={JSON.stringify(mine)} />
      <div className="field">
        <label htmlFor="ir-brand">Brand</label>
        <select id="ir-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input min-h-11">
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      {brand && brand.inks.length === 0 && <p className="m-0 text-[13px] opacity-70">No colours on file for this brand. Add them under Customers.</p>}
      {brand && brand.inks.length > 0 && (
        <div className="border-t border-divider">
          <div className="th-row grid grid-cols-[minmax(0,1fr)_130px_120px] gap-3 border-b border-divider py-2">
            <span>Ink</span>
            <span>Grams per sheet</span>
            <span className="text-right">A stillage of {sheets.toLocaleString("en-US")}</span>
          </div>
          {brand.inks.map((i) => {
            const v = mine[i.materialId] ?? "";
            const g = Number(v.replace(",", "."));
            return (
              <div key={i.materialId} className="grid grid-cols-[minmax(0,1fr)_130px_120px] items-center gap-3 border-b border-divider py-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block size-4 shrink-0 rounded-full"
                    style={{ background: i.hex ?? "transparent", boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)" }}
                  />
                  <span className="truncate">{i.name}</span>
                </span>
                <input
                  aria-label={`${i.name}: grams per sheet`}
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setRates((r) => ({ ...r, [brandId]: { ...r[brandId], [i.materialId]: e.target.value } }))}
                  placeholder="e.g. 0.8"
                  className="input min-h-10"
                />
                <span className="text-right tabular-nums opacity-75">{g > 0 ? formatGrams(inkFor(sheets, g)) : "-"}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="m-0 text-[12px] opacity-70">
        The print and sample forms fill in the ink from these (sheets × grams per sheet); the printer can change the figure there. The same ink on several brands is one stock.
      </p>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={pending || !brand || brand.inks.length === 0} icon="✓" className="w-[150px]">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function MaterialSettingsForm({ material, close }: { material?: MaterialFields; close: () => void }) {
  const [state, action, pending] = useActionState<InvState, FormData>(saveMaterial, null);
  const [basis, setBasis] = useState(material?.use_basis ?? "");
  const [unit, setUnit] = useState(material?.unit ?? "");
  if (material?.ink) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={material.id} />
        <input type="hidden" name="name" value={material.name} />
        <input type="hidden" name="unit" value="kg" />
        <div className="field">
          <label htmlFor="ms-reorder">Reorder level in kg (optional)</label>
          <input id="ms-reorder" name="reorder_level" inputMode="decimal" defaultValue={material.reorder_level ?? ""} placeholder="e.g. 5" className="input" />
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="active" defaultChecked={material.active !== false} className="size-4 accent-[var(--color-accent)]" />
          On the list (untick to take it off: its history stays in the reports)
        </label>
        <p className="m-0 text-[12px] opacity-70">
          Ink comes off the stock with each printed stillage and sample: the figure filled in from the grams per sheet (set per brand under &ldquo;Ink per sheet&rdquo;), or what the
          printer typed.
        </p>
        <FormMessage state={state} />
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={close}>
            {state?.ok ? "Done" : "Cancel"}
          </Button>
          {!state?.ok && (
            <Button type="submit" disabled={pending} icon="✓" className="w-[150px]">
              {pending ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      {material && <input type="hidden" name="id" value={material.id} />}
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <div className="field">
          <label htmlFor="ms-name">Name</label>
          <input id="ms-name" name="name" required maxLength={80} defaultValue={material?.name} placeholder="e.g. LPG" className="input" />
        </div>
        <div className="field">
          <label htmlFor="ms-unit">Unit</label>
          <input id="ms-unit" name="unit" required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" className="input" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ms-reorder">Reorder level (optional)</label>
        <input id="ms-reorder" name="reorder_level" inputMode="decimal" defaultValue={material?.reorder_level ?? ""} className="input" />
      </div>
      <div className="field">
        <label htmlFor="ms-basis">Used automatically</label>
        <select id="ms-basis" name="use_basis" value={basis} onChange={(e) => setBasis(e.target.value)} className="input">
          <option value="">Not tracked (record it in / out by hand)</option>
          {(Object.keys(USE_BASIS) as UseBasis[]).map((b) => (
            <option key={b} value={b}>
              {USE_BASIS[b].label}
            </option>
          ))}
        </select>
      </div>
      {basis && (
        <div className="field">
          <label htmlFor="ms-rate">
            {unit || "Units"} used per {USE_BASIS[basis as UseBasis].per}
          </label>
          <input id="ms-rate" name="use_rate" inputMode="decimal" required defaultValue={material?.use_rate ?? ""} placeholder="e.g. 0.5" className="input" />
        </div>
      )}
      {material && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="active" defaultChecked={material.active !== false} className="size-4 accent-[var(--color-accent)]" />
          On the list (untick to take it off: it stops being used automatically and its history stays in the reports)
        </label>
      )}
      <p className="m-0 text-[12px] opacity-70">
        With a rate, logging sheets, oven passes and production takes the material off the stock by itself, from now on. Stock can then go below zero if deliveries
        aren&apos;t recorded: that means a count is due.
      </p>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="✓" className="w-[150px]">
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </form>
  );
}

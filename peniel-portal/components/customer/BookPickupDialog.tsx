"use client";

import { useActionState } from "react";
import { bookPickup, type PickupState } from "@/app/(customer)/production/actions";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";

/** Book a pickup of available stock at Bole Lemi. */
export default function BookPickupDialog({ stock, min }: { stock: { id: string; label: string }[]; min: string }) {
  const [state, action, pending] = useActionState<PickupState, FormData>(bookPickup, null);
  return (
    <Modal
      title="Book a pickup"
      trigger={(open) => (
        <button type="button" onClick={open} disabled={stock.length === 0} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-bg underline disabled:cursor-not-allowed disabled:opacity-50">
          Book pickup →
        </button>
      )}
    >
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[12px] text-text/70">Batches to collect</legend>
            {stock.map((s) => (
              <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 border-b border-divider text-[14px]">
                <input type="checkbox" name="stock_id" value={s.id} defaultChecked className="size-4 accent-[var(--color-accent)]" />
                {s.label}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="bp-at">Pickup date and time</label>
            <input id="bp-at" name="requested_at" type="datetime-local" min={min} required className="input min-h-11" />
          </div>
          <div className="field">
            <label htmlFor="bp-note">Note for Peniel (optional)</label>
            <textarea id="bp-note" name="note" maxLength={500} placeholder="Truck, driver, anything we should know" className="input !min-h-[64px]" />
          </div>
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              {state?.ok ? "Done" : "Cancel"}
            </Button>
            {!state?.ok && (
              <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
                {pending ? "Booking…" : "Request pickup"}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

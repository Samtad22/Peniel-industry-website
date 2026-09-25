"use client";

import { useActionState, useState } from "react";
import { addSortingRecord, deleteSortingRecord, type SortingState } from "@/app/ops/quality/actions";
import Modal from "@/components/ui/Modal";
import { InternalOnly } from "@/components/ui/Visibility";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { cartonsLine, formatWastePct } from "@/lib/sorting";

export type SortingBatch = { id: string; label: string };

/** "+ Record sorting": one batch from the daily sorting report (internal only). */
export function SortingDialog({
  batches,
  today,
  triggerLabel = "+ Record sorting",
  variant = "primary",
}: {
  /** Held batches to choose from; one entry = that batch, no choice. */
  batches: SortingBatch[];
  today: string;
  triggerLabel?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Modal
      title="Record sorting"
      trigger={(open) => (
        <Button type="button" variant={variant} onClick={open} className={variant === "secondary" ? "whitespace-nowrap text-text" : "whitespace-nowrap"}>
          {triggerLabel}
        </Button>
      )}
    >
      {(close) => <SortingForm batches={batches} today={today} close={close} />}
    </Modal>
  );
}

function SortingForm({ batches, today, close }: { batches: SortingBatch[]; today: string; close: () => void }) {
  const [batch, setBatch] = useState(batches.length === 1 ? batches[0].id : "");
  const [date, setDate] = useState(today);
  const [passed, setPassed] = useState("");
  const [waste, setWaste] = useState("");
  const [reporter, setReporter] = useState("");
  const [state, action, pending] = useActionState<SortingState, FormData>(async (prev, fd) => {
    const res = await addSortingRecord(prev, fd);
    // Saved: keep the date and reporter for the next batch in the same report.
    if (res?.ok) {
      setPassed("");
      setWaste("");
      if (batches.length > 1) setBatch("");
    }
    return res;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <InternalOnly>Internal only · customers see the batch on hold, then released</InternalOnly>
      </div>
      {batches.length === 1 ? (
        <>
          <input type="hidden" name="inspection_id" value={batches[0].id} />
          <p className="m-0 text-[14px]">
            <b>{batches[0].label}</b>
          </p>
        </>
      ) : (
        <Field label="Batch on hold" htmlFor="so-batch">
          <select id="so-batch" name="inspection_id" required value={batch} onChange={(e) => setBatch(e.target.value)} className="input min-h-11">
            <option value="">Choose a batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {batches.length === 0 && <p className="m-0 text-[13px] opacity-70">No batches are on hold. Put a batch on hold from its inspection first.</p>}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Date of the report" htmlFor="so-date">
          <input id="so-date" name="sorted_on" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="input min-h-11" />
        </Field>
        <Field label="Reported by" htmlFor="so-by">
          <input id="so-by" name="reported_by" maxLength={100} value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="e.g. Garedew" className="input min-h-11" />
        </Field>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Passed (cartons) · the report's Quantity" htmlFor="so-qty">
          <input id="so-qty" name="passed_cartons" inputMode="numeric" pattern="\d*" value={passed} onChange={(e) => setPassed(e.target.value)} className="input min-h-11" />
        </Field>
        <Field label="Waste (cartons) · scrapped" htmlFor="so-waste">
          <input id="so-waste" name="waste_cartons" inputMode="numeric" pattern="\d*" value={waste} onChange={(e) => setWaste(e.target.value)} className="input min-h-11" />
        </Field>
      </div>
      <span className="text-[12px] opacity-70">
        {passed || waste
          ? `${cartonsLine((Number(passed) || 0) + (Number(waste) || 0))} sorted: ${Number(passed) || 0} passed, ${Number(waste) || 0} waste (${formatWastePct(Number(passed) || 0, Number(waste) || 0)}). `
          : ""}
        1 carton = 10,000 crowns.
      </span>
      <Field label="Notes (internal)" htmlFor="so-notes">
        <textarea id="so-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={pending || batches.length === 0} icon="→" className="w-[170px]">
          {pending ? "Saving…" : state?.ok ? "Save another" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** Delete a sorting report entered by mistake. */
export function DeleteSortingButton({ id }: { id: string }) {
  return (
    <form
      action={deleteSortingRecord}
      onSubmit={(e) => {
        if (!confirm("Delete this sorting report?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label="Delete this sorting report" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
        Delete
      </button>
    </form>
  );
}

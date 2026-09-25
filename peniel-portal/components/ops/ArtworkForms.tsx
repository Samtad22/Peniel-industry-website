"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { recordProofDispatch, reviewSubmission, type ArtworkState } from "@/app/ops/artwork/actions";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees } from "@/components/ui/Visibility";
import type { PhysicalDelivery } from "@/lib/proofs";

export type DeliveryValue = { method: "" | PhysicalDelivery; courier: string; tracking: string; driver: string; vehicle: string };
export const NO_DELIVERY: DeliveryValue = { method: "", courier: "DHL", tracking: "", driver: "", vehicle: "" };

const METHODS: [DeliveryValue["method"], string][] = [
  ["", "Portal only"],
  ["courier", "Courier (DHL…)"],
  ["peniel_driver", "Peniel driver"],
];

/**
 * How a proof reaches the customer. Controlled (send panel) or uncontrolled
 * with `name`d inputs (dispatch dialog). Driver and vehicle are internal.
 */
export function DeliveryFields({
  value,
  onChange,
  allowPortal = true,
  idPrefix,
}: {
  value: DeliveryValue;
  onChange: (v: DeliveryValue) => void;
  allowPortal?: boolean;
  idPrefix: string;
}) {
  const set = (patch: Partial<DeliveryValue>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
      <legend className="mb-1.5 text-[12px] font-semibold">How is the proof delivered?</legend>
      <input type="hidden" name="method" value={value.method} />
      <div className="seg self-start" role="radiogroup">
        {METHODS.filter(([m]) => allowPortal || m).map(([m, label]) => (
          <button
            key={m || "portal"}
            type="button"
            role="radio"
            aria-checked={value.method === m}
            onClick={() => set({ method: m })}
            className={`seg-opt cursor-pointer border-0 ${value.method === m ? "!bg-accent !text-bg" : "bg-transparent text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {value.method === "courier" && (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5">
          <div className="field">
            <label htmlFor={`${idPrefix}-courier`}>Courier</label>
            <input id={`${idPrefix}-courier`} name="courier" value={value.courier} onChange={(e) => set({ courier: e.target.value })} maxLength={60} className="input !bg-bg" />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-tracking`} className="!flex justify-between gap-2">
              Tracking number
              <CustomerSees />
            </label>
            <input
              id={`${idPrefix}-tracking`}
              name="tracking"
              value={value.tracking}
              onChange={(e) => set({ tracking: e.target.value })}
              maxLength={60}
              placeholder="e.g. 1234567890 (can be added later)"
              className="input !bg-bg font-mono"
            />
          </div>
        </div>
      )}
      {value.method === "peniel_driver" && (
        <div className="flex flex-col gap-2 border border-dashed border-neutral-600 bg-neutral-200 p-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]">
            <Lock size={11} aria-hidden="true" /> Internal only: the customer just sees “delivered by Peniel”
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="field">
              <label htmlFor={`${idPrefix}-driver`}>Driver</label>
              <input id={`${idPrefix}-driver`} name="driver" value={value.driver} onChange={(e) => set({ driver: e.target.value })} maxLength={100} className="input !bg-bg" />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-vehicle`}>Vehicle / plate</label>
              <input id={`${idPrefix}-vehicle`} name="vehicle" value={value.vehicle} onChange={(e) => set({ vehicle: e.target.value })} maxLength={40} placeholder="AA 3-12345" className="input !bg-bg" />
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** "Dispatch…" on a proof in the queue: add or correct courier/tracking or driver later. */
export function DispatchDialog({ proofId, label, current }: { proofId: string; label: string; current: DeliveryValue }) {
  return (
    <Modal
      title={`Physical proof · ${label}`}
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent underline underline-offset-2">
          {current.method ? "Edit delivery" : "Dispatch…"}
        </button>
      )}
    >
      {(close) => <DispatchForm proofId={proofId} current={current} close={close} />}
    </Modal>
  );
}

function DispatchForm({ proofId, current, close }: { proofId: string; current: DeliveryValue; close: () => void }) {
  const [value, setValue] = useState<DeliveryValue>(current.method ? current : { ...NO_DELIVERY, method: "courier" });
  const [state, action, pending] = useActionState<ArtworkState, FormData>(recordProofDispatch, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="proof_id" value={proofId} />
      <DeliveryFields value={value} onChange={setValue} allowPortal={false} idPrefix={`d-${proofId}`} />
      <span className="text-[12px] opacity-70">The customer gets an email; with DHL it includes a tracking link.</span>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={pending} icon="→" className="w-[150px]">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** Accept a customer's artwork, or ask for changes (the comment is shown to them). */
export function ReviewSubmissionForm({ submissionId }: { submissionId: string }) {
  const [state, action, pending] = useActionState<ArtworkState, FormData>(reviewSubmission, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="submission_id" value={submissionId} />
      <label htmlFor={`rv-${submissionId}`} className="!flex justify-between gap-2 text-[12px]">
        Reply to the customer (required to ask for changes)
        <CustomerSees />
      </label>
      <textarea id={`rv-${submissionId}`} name="comment" maxLength={2000} placeholder="e.g. Please send the logo as a vector PDF" className="input !min-h-[56px] !bg-bg" />
      <FormMessage state={state} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="submit" name="decision" value="accept" disabled={pending} icon="✓">
          Accept
        </Button>
        <Button type="submit" name="decision" value="changes" variant="secondary" disabled={pending} icon="↺" className="text-text">
          Ask for changes
        </Button>
      </div>
    </form>
  );
}

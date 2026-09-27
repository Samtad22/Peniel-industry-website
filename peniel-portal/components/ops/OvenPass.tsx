"use client";

import { usePlant } from "@/components/PlantSettings";
import { useActionState, useEffect, useState } from "react";
import { deletePass, finishPass, startPass, type PrintRunState } from "@/app/ops/production/sheets/actions";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { minutesBetween, OVEN_STAGE_LABEL, type OvenStage } from "@/lib/print-runs";

const STAGE = OVEN_STAGE_LABEL;

/** `datetime-local` value plus minutes ("2026-09-27T08:00" + 30 → "2026-09-27T08:30"). */
const addMinutes = (local: string, minutes: number) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? new Date(new Date(`${local}:00Z`).getTime() + minutes * 60_000).toISOString().slice(0, 16) : "";

/** "Varnish in the oven" / "Lacquer in the oven" for one stillage (internal only). */
export function IntoOvenDialog({
  runId,
  stillageNo,
  stage,
  nowLocal,
  materials,
  lastTemp,
  primary,
}: {
  runId: string;
  stillageNo: string;
  stage: OvenStage;
  /** Now in Addis Ababa as a datetime-local value. */
  nowLocal: string;
  /** Varnishes or lacquers used before, as suggestions. */
  materials: string[];
  /** The last oven temperature used for this stage. */
  lastTemp: number | null;
  primary?: boolean;
}) {
  return (
    <Modal
      title={`${STAGE[stage]} · stillage ${stillageNo}`}
      trigger={(open) => (
        <Button type="button" variant={primary ? "primary" : "secondary"} onClick={open} icon="→" className={`w-full whitespace-nowrap ${primary ? "" : "text-text"}`}>
          {STAGE[stage]} into oven
        </Button>
      )}
    >
      {(close) => <IntoOvenForm runId={runId} stage={stage} nowLocal={nowLocal} materials={materials} lastTemp={lastTemp} close={close} />}
    </Modal>
  );
}

function IntoOvenForm({
  runId,
  stage,
  nowLocal,
  materials,
  lastTemp,
  close,
}: {
  runId: string;
  stage: OvenStage;
  nowLocal: string;
  materials: string[];
  lastTemp: number | null;
  close: () => void;
}) {
  const { oven_minutes: OVEN_MINUTES } = usePlant();
  const [state, action, pending] = useActionState<PrintRunState, FormData>(startPass, null);
  const [startedAt, setStartedAt] = useState(nowLocal);
  const [alreadyOut, setAlreadyOut] = useState(false);
  const [finishedAt, setFinishedAt] = useState(addMinutes(nowLocal, OVEN_MINUTES));
  const setIn = (v: string) => {
    setStartedAt(v);
    setFinishedAt(addMinutes(v, OVEN_MINUTES));
  };
  const listId = `oven-${stage}-materials`;

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="print_run_id" value={runId} />
      <input type="hidden" name="stage" value={stage} />
      <div className="flex justify-end">
        <InternalOnly />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Into the oven" htmlFor="ov-in">
          <input id="ov-in" name="started_at" type="datetime-local" required max={nowLocal} value={startedAt} onChange={(e) => setIn(e.target.value)} className="input min-h-11" />
        </Field>
        <Field label="Oven temperature (°C)" htmlFor="ov-temp">
          <input id="ov-temp" name="oven_temp_c" inputMode="decimal" defaultValue={lastTemp ?? ""} placeholder="e.g. 185" className="input min-h-11" />
        </Field>
      </div>
      <Field label={stage === "varnish" ? "Varnish" : "Lacquer"} htmlFor="ov-mat">
        <input id="ov-mat" name="material" maxLength={100} list={listId} defaultValue={materials[0] ?? ""} placeholder={stage === "varnish" ? "e.g. Gold varnish" : "e.g. Inside lacquer"} className="input min-h-11" />
        <datalist id={listId}>
          {materials.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={alreadyOut}
          onChange={(e) => {
            setAlreadyOut(e.target.checked);
            // Already out: it usually went in half an hour ago and came out now.
            if (e.target.checked && startedAt === nowLocal) {
              setStartedAt(addMinutes(nowLocal, -OVEN_MINUTES));
              setFinishedAt(nowLocal);
            }
          }}
          className="size-4 accent-[var(--color-accent)]"
        />
        It has already come out (log the whole pass now)
      </label>
      {alreadyOut && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label={`Out of the oven (usually ${OVEN_MINUTES} min)`} htmlFor="ov-out">
            <input id="ov-out" name="finished_at" type="datetime-local" required min={startedAt} max={nowLocal} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} className="input min-h-11" />
          </Field>
          <Field label="Sheets spoiled in the oven" htmlFor="ov-sp">
            <input id="ov-sp" name="sheets_spoiled" inputMode="numeric" placeholder="0" className="input min-h-11" />
          </Field>
        </div>
      )}
      <Field label="Notes (internal)" htmlFor="ov-notes">
        <textarea id="ov-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="→" className="w-[190px]">
            {pending ? "Saving…" : alreadyOut ? "Save the pass" : "Into the oven"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** "Out of the oven": when it came out, and sheets spoiled in the pass. */
export function OutOfOvenDialog({ passId, stillageNo, stage, startedAt, nowLocal }: { passId: string; stillageNo: string; stage: OvenStage; startedAt: string; nowLocal: string }) {
  return (
    <Modal
      title={`${STAGE[stage]} out · stillage ${stillageNo}`}
      trigger={(open) => (
        <Button type="button" onClick={open} icon="✓" className="w-full whitespace-nowrap">
          Out of oven
        </Button>
      )}
    >
      {(close) => <OutForm passId={passId} startedAt={startedAt} nowLocal={nowLocal} close={close} />}
    </Modal>
  );
}

function OutForm({ passId, startedAt, nowLocal, close }: { passId: string; startedAt: string; nowLocal: string; close: () => void }) {
  const [state, action, pending] = useActionState<PrintRunState, FormData>(finishPass, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="pass_id" value={passId} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Out of the oven" htmlFor="oo-out">
          <input id="oo-out" name="finished_at" type="datetime-local" required defaultValue={nowLocal} className="input min-h-11" />
        </Field>
        <Field label="Sheets spoiled in the oven" htmlFor="oo-sp">
          <input id="oo-sp" name="sheets_spoiled" inputMode="numeric" placeholder="0" className="input min-h-11" />
        </Field>
      </div>
      <p className="m-0 text-[12px] opacity-70">In since {new Date(startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" })}.</p>
      <Field label="Notes (internal)" htmlFor="oo-notes">
        <textarea id="oo-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[56px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="✓" className="w-[170px]">
            {pending ? "Saving…" : "Out of oven"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Minutes in the oven so far against the usual 30, ticking. Red once past it. */
export function OvenTimer({ startedAt, now }: { startedAt: string; now: string }) {
  const { oven_minutes: OVEN_MINUTES } = usePlant();
  const [at, setAt] = useState(now);
  useEffect(() => {
    const t = window.setInterval(() => setAt(new Date().toISOString()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const mins = minutesBetween(startedAt, at);
  const over = mins > OVEN_MINUTES;
  return (
    <span className="flex flex-col items-end leading-none" suppressHydrationWarning>
      <b className={`text-[28px] tracking-[-.03em] ${over ? "text-accent" : ""}`} suppressHydrationWarning>
        {mins}
        <span className="text-[13px] font-normal"> min</span>
      </b>
      <span className={`mt-1 text-[11px] ${over ? "font-extrabold text-accent" : "opacity-70"}`} suppressHydrationWarning>
        {over ? `${mins - OVEN_MINUTES} over ${OVEN_MINUTES}` : `${OVEN_MINUTES - mins} to go`}
      </span>
    </span>
  );
}

/** Remove an oven pass entered by mistake. */
export function DeletePassButton({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={deletePass}
      onSubmit={(e) => {
        if (!confirm(`Delete the ${label}?`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label={`Delete the ${label}`} className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent-800 underline underline-offset-2">
        undo
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { addMachine, deleteMaintenance, finishMaintenance, logMaintenance, updateMachine, type MaintState } from "@/app/ops/maintenance/actions";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { MACHINE_SECTIONS, MACHINE_STATUS, MAINTENANCE_KINDS, type Machine, type MachineStatus, type MaintenanceKind } from "@/lib/maintenance";


function Actions({ state, pending, close, label }: { state: MaintState; pending: boolean; close: () => void; label: string }) {
  return (
    <>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
            {pending ? "Saving…" : label}
          </Button>
        )}
      </div>
    </>
  );
}

/** "Log a job": a breakdown, repair, planned service… on one machine (internal only). */
export function LogJobDialog({ machines, machineId, nowLocal, compact }: { machines: Machine[]; machineId?: string; nowLocal: string; compact?: boolean }) {
  const one = machines.find((m) => m.id === machineId);
  return (
    <Modal
      wide
      title={one ? `Log a job · ${one.name}` : "Log a maintenance job"}
      trigger={(open) =>
        compact ? (
          <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold underline underline-offset-2">
            + Log a job
          </button>
        ) : (
          <Button type="button" onClick={open} icon="+" className="whitespace-nowrap">
            Log a job
          </Button>
        )
      }
    >
      {(close) => <LogJobForm machines={machines} machineId={machineId} nowLocal={nowLocal} close={close} />}
    </Modal>
  );
}

function LogJobForm({ machines, machineId, nowLocal, close }: { machines: Machine[]; machineId?: string; nowLocal: string; close: () => void }) {
  const [state, action, pending] = useActionState<MaintState, FormData>(logMaintenance, null);
  const [kind, setKind] = useState<MaintenanceKind>("breakdown");
  const [stops, setStops] = useState(true);
  const [ongoing, setOngoing] = useState(true);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <InternalOnly />
      </div>
      {machineId ? (
        <input type="hidden" name="machine_id" value={machineId} />
      ) : (
        <Field label="Machine" htmlFor="mj-machine">
          <select id="mj-machine" name="machine_id" required defaultValue="" className="input min-h-11">
            <option value="" disabled>
              Choose the machine
            </option>
            {MACHINE_SECTIONS.map((s) => (
              <optgroup key={s.category} label={s.title}>
                {machines
                  .filter((m) => m.category === s.category)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      <Field label="Kind of job" htmlFor="mj-kind">
        <select
          id="mj-kind"
          name="kind"
          value={kind}
          onChange={(e) => {
            const k = e.target.value as MaintenanceKind;
            setKind(k);
            setStops(MAINTENANCE_KINDS[k].stops);
            setOngoing(k === "breakdown" || k === "repair");
          }}
          className="input min-h-11"
        >
          {Object.entries(MAINTENANCE_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={kind === "breakdown" ? "What went wrong" : "What was done"} htmlFor="mj-desc">
        <textarea id="mj-desc" name="description" required maxLength={1000} placeholder={kind === "breakdown" ? "e.g. Liner 1B stopped: compound nozzle blocked" : "e.g. Rollers cleaned and greased"} className="input !min-h-[64px]" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Started" htmlFor="mj-start">
          <input id="mj-start" name="started_at" type="datetime-local" required max={nowLocal} defaultValue={nowLocal} className="input min-h-11" />
        </Field>
        {!ongoing && (
          <Field label="Finished" htmlFor="mj-end">
            <input id="mj-end" name="finished_at" type="datetime-local" required max={nowLocal} defaultValue={nowLocal} className="input min-h-11" />
          </Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="ongoing" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        Still going on (finish it later)
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="stopped_machine" checked={stops} onChange={(e) => setStops(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        The machine was stopped (counts as downtime{ongoing ? "; it shows as down until finished" : ""})
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Parts used (optional)" htmlFor="mj-parts">
          <input id="mj-parts" name="parts" maxLength={500} placeholder="e.g. Bearing 6205, V-belt" className="input min-h-11" />
        </Field>
        <Field label="Done by (optional)" htmlFor="mj-by">
          <input id="mj-by" name="done_by" maxLength={120} placeholder="Technician's name" className="input min-h-11" />
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="mj-notes">
        <textarea id="mj-notes" name="notes" maxLength={1000} className="input !min-h-[48px]" />
      </Field>
      <Actions state={state} pending={pending} close={close} label="Log the job" />
    </form>
  );
}

/** "Finish": when an ongoing job ended and what was done. */
export function FinishJobDialog({ id, title, nowLocal }: { id: string; title: string; nowLocal: string }) {
  return (
    <Modal
      title={`Finish · ${title}`}
      trigger={(open) => (
        <Button type="button" onClick={open} icon="✓" className="whitespace-nowrap">
          Finish
        </Button>
      )}
    >
      {(close) => <FinishForm id={id} nowLocal={nowLocal} close={close} />}
    </Modal>
  );
}

function FinishForm({ id, nowLocal, close }: { id: string; nowLocal: string; close: () => void }) {
  const [state, action, pending] = useActionState<MaintState, FormData>(finishMaintenance, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="id" value={id} />
      <Field label="Finished" htmlFor="mf-end">
        <input id="mf-end" name="finished_at" type="datetime-local" required max={nowLocal} defaultValue={nowLocal} className="input min-h-11" />
      </Field>
      <Field label="What was done (optional)" htmlFor="mf-done">
        <textarea id="mf-done" name="done" maxLength={600} placeholder="e.g. Nozzle replaced, test run OK" className="input !min-h-[56px]" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Parts used (optional)" htmlFor="mf-parts">
          <input id="mf-parts" name="parts" maxLength={500} className="input min-h-11" />
        </Field>
        <Field label="Done by (optional)" htmlFor="mf-by">
          <input id="mf-by" name="done_by" maxLength={120} className="input min-h-11" />
        </Field>
      </div>
      <Actions state={state} pending={pending} close={close} label="Finish the job" />
    </form>
  );
}

/** Change a machine's status (running, down, idle, on the way), its note and service interval. */
export function MachineDialog({ machine, isAdmin }: { machine: Machine; isAdmin: boolean }) {
  return (
    <Modal
      title={machine.name}
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 opacity-80">
          Status
        </button>
      )}
    >
      {(close) => <MachineForm machine={machine} isAdmin={isAdmin} close={close} />}
    </Modal>
  );
}

function MachineForm({ machine, isAdmin, close }: { machine: Machine; isAdmin: boolean; close: () => void }) {
  const [state, action, pending] = useActionState<MaintState, FormData>(updateMachine, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="id" value={machine.id} />
      {isAdmin && (
        <Field label="Name" htmlFor="mm-name">
          <input id="mm-name" name="name" maxLength={80} defaultValue={machine.name} className="input min-h-11" />
        </Field>
      )}
      <Field label="Status" htmlFor="mm-status">
        <select id="mm-status" name="status" defaultValue={machine.status} className="input min-h-11">
          {(Object.keys(MACHINE_STATUS) as MachineStatus[]).map((s) => (
            <option key={s} value={s}>
              {MACHINE_STATUS[s].label.replace(/^[●■] /, "")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)" htmlFor="mm-note">
        <input id="mm-note" name="status_note" maxLength={200} defaultValue={machine.status_note ?? ""} placeholder="e.g. Under repair, waiting for parts" className="input min-h-11" />
      </Field>
      <Field label="Planned service every (days, optional)" htmlFor="mm-every">
        <input id="mm-every" name="service_every_days" inputMode="numeric" defaultValue={machine.service_every_days ?? ""} placeholder="e.g. 30" className="input min-h-11" />
      </Field>
      <p className="m-0 text-[12px] opacity-70">Logging a job that stops the machine marks it down; finishing that job marks it running again.</p>
      <Actions state={state} pending={pending} close={close} label="Save" />
    </form>
  );
}

/** Add a machine (admin only), e.g. when new equipment arrives. */
export function AddMachineDialog({ presses }: { presses: Machine[] }) {
  return (
    <Modal
      title="Add a machine"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="+" className="whitespace-nowrap text-text">
          Add a machine
        </Button>
      )}
    >
      {(close) => <AddMachineForm presses={presses} close={close} />}
    </Modal>
  );
}

function AddMachineForm({ presses, close }: { presses: Machine[]; close: () => void }) {
  const [state, action, pending] = useActionState<MaintState, FormData>(addMachine, null);
  const [category, setCategory] = useState("press");
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <Field label="Name" htmlFor="ma-name">
        <input id="ma-name" name="name" required maxLength={80} placeholder="e.g. Liner 1C" className="input min-h-11" />
      </Field>
      <Field label="Section" htmlFor="ma-cat">
        <select id="ma-cat" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="input min-h-11">
          {MACHINE_SECTIONS.map((s) => (
            <option key={s.category} value={s.category}>
              {s.title}
            </option>
          ))}
        </select>
      </Field>
      {category === "press" && (
        <Field label="Belongs to (for a liner)" htmlFor="ma-parent">
          <select id="ma-parent" name="parent_id" defaultValue="" className="input min-h-11">
            <option value="">Nothing: it&apos;s a press</option>
            {presses.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Status" htmlFor="ma-status">
        <select id="ma-status" name="status" defaultValue="running" className="input min-h-11">
          {(Object.keys(MACHINE_STATUS) as MachineStatus[]).map((s) => (
            <option key={s} value={s}>
              {MACHINE_STATUS[s].label.replace(/^[●■] /, "")}
            </option>
          ))}
        </select>
      </Field>
      <Actions state={state} pending={pending} close={close} label="Add" />
    </form>
  );
}

/** Remove a job logged by mistake. */
export function DeleteJobButton({ id }: { id: string }) {
  return (
    <form
      action={deleteMaintenance}
      onSubmit={(e) => {
        if (!confirm("Delete this job from the log?")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label="Delete this job" className="cursor-pointer border-0 bg-transparent p-0 text-[14px] leading-none text-accent-800">
        ×
      </button>
    </form>
  );
}

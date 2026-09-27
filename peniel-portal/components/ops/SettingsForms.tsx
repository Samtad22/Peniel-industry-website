"use client";

import { useActionState, useState } from "react";
import {
  addPreset,
  movePreset,
  removePreset,
  saveCoa,
  saveEmails,
  savePlant,
  sendTestEmail,
  setStaffRole,
  updatePreset,
  type SettingsState,
} from "@/app/ops/settings/actions";
import Modal from "@/components/ui/Modal";
import ConfirmForm from "@/components/ui/ConfirmForm";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/roles";
import { EMAIL_GROUPS, type CoaSettings, type EmailGroup, type PlantSettings } from "@/lib/settings";

function SaveRow({ state, pending, label = "Save" }: { state: SettingsState; pending: boolean; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="✓" className="w-[170px] self-end">
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

/** Camera reject limit, minutes per oven pass, sheets a stillage starts at. */
export function PlantForm({ plant }: { plant: PlantSettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePlant, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Field label="Camera reject limit (%)" htmlFor="pl-limit" hint="Flagged above this on entries, quality and the customer's page.">
          <input id="pl-limit" name="reject_limit_pct" inputMode="decimal" defaultValue={plant.reject_limit_pct} className="input min-h-11" />
        </Field>
        <Field label="Minutes per oven pass" htmlFor="pl-oven" hint="The timer turns red after this.">
          <input id="pl-oven" name="oven_minutes" inputMode="numeric" defaultValue={plant.oven_minutes} className="input min-h-11" />
        </Field>
        <Field label="Sheets a stillage starts at" htmlFor="pl-sheets" hint="Staff type the real count.">
          <input id="pl-sheets" name="stillage_sheets" inputMode="numeric" defaultValue={plant.stillage_sheets} className="input min-h-11" />
        </Field>
      </div>
      <SaveRow state={state} pending={pending} />
    </form>
  );
}

/** What every Certificate of Analysis prints. */
export function CoaForm({ coa }: { coa: CoaSettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCoa, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <Field label="Company name" htmlFor="coa-company">
        <input id="coa-company" name="company" maxLength={120} defaultValue={coa.company} className="input min-h-11" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Field label="Document no." htmlFor="coa-doc">
          <input id="coa-doc" name="documentNo" maxLength={40} defaultValue={coa.documentNo} className="input min-h-11" />
        </Field>
        <Field label="Revision no." htmlFor="coa-rev">
          <input id="coa-rev" name="revision" maxLength={20} defaultValue={coa.revision} className="input min-h-11" />
        </Field>
        <Field label="Liner type ID (PVC-free)" htmlFor="coa-liner">
          <input id="coa-liner" name="linerTypeId" maxLength={60} defaultValue={coa.linerTypeId} className="input min-h-11" />
        </Field>
      </div>
      <Field label="Telephone" htmlFor="coa-tel">
        <input id="coa-tel" name="tel" maxLength={120} defaultValue={coa.tel} className="input min-h-11" />
      </Field>
      <SaveRow state={state} pending={pending} />
    </form>
  );
}

/** Groups of emails on or off, and who gets the end-of-day and monthly reports. */
export function EmailsForm({ off, staff, recipients }: { off: EmailGroup[]; staff: { user_id: string; full_name: string; role: StaffRole; email: string | null }[]; recipients: string[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveEmails, null);
  const [who, setWho] = useState<"admins" | "chosen">(recipients.length ? "chosen" : "admins");
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col border-0 p-0">
        <legend className="mb-1 p-0 text-[12px] opacity-70">Emails that go out (untick to stop a group)</legend>
        {EMAIL_GROUPS.map((g) => (
          <label key={g.key} className="grid cursor-pointer grid-cols-[22px_90px_minmax(0,1fr)] items-start gap-2 border-b border-divider py-2 text-[13px]">
            <input type="checkbox" name="on" value={g.key} defaultChecked={!off.includes(g.key)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
            <b>{g.who}</b>
            <span>{g.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 p-0 text-[12px] opacity-70">End-of-day report and monthly summary go to</legend>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="radio" name="who" checked={who === "admins"} onChange={() => setWho("admins")} className="accent-[var(--color-accent)]" />
            All admins
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="radio" name="who" checked={who === "chosen"} onChange={() => setWho("chosen")} className="accent-[var(--color-accent)]" />
            These people
          </label>
        </div>
        {who === "chosen" && (
          <div className="grid gap-1 sm:grid-cols-2">
            {staff.map((p) => (
              <label key={p.user_id} className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" name="report_to" value={p.user_id} defaultChecked={recipients.includes(p.user_id)} className="size-4 accent-[var(--color-accent)]" />
                {p.full_name} <span className="opacity-60">· {ROLE_LABELS[p.role]}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <SaveRow state={state} pending={pending} />
    </form>
  );
}

/** Send a test email to yourself. */
export function TestEmailButton() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(async () => sendTestEmail(), null);
  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      <button type="submit" disabled={pending} className="btn btn-secondary btn-split text-text">
        {pending ? "Sending…" : "Send me a test email"}
        <span aria-hidden="true">✉︎</span>
      </button>
      <FormMessage state={state} />
    </form>
  );
}

/** One list of reasons staff pick from: edit, reorder, remove, add. */
export function PresetList({ kind, presets }: { kind: "hold" | "reject"; presets: { id: string; text: string }[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addPreset, null);
  const iconBtn = "cursor-pointer border-0 bg-transparent px-1 text-[14px] leading-none disabled:opacity-25";
  return (
    <div className="flex flex-col gap-2">
      {presets.length === 0 && <p className="m-0 text-[13px] opacity-60">No reasons yet.</p>}
      {presets.map((p, i) => (
        <div key={p.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 border-b border-divider py-2 text-[13px]">
          <b>{i + 1}</b>
          <span>{p.text}</span>
          <span className="flex items-center gap-1">
            <form action={movePreset} className="inline">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="dir" value="up" />
              <button type="submit" disabled={i === 0} aria-label="Move up" className={iconBtn}>
                ↑
              </button>
            </form>
            <form action={movePreset} className="inline">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="dir" value="down" />
              <button type="submit" disabled={i === presets.length - 1} aria-label="Move down" className={iconBtn}>
                ↓
              </button>
            </form>
            <EditPreset id={p.id} text={p.text} />
            <ConfirmForm action={removePreset} fields={{ id: p.id }} message="Remove this reason from the list? Orders that used it keep their text." label="Remove" />
          </span>
        </div>
      ))}
      {/* React resets this form once the reason is added. */}
      <form action={action} className="flex flex-col gap-2 pt-1">
        <input type="hidden" name="kind" value={kind} />
        <div className="flex gap-2">
          <input
            name="text"
            required
            minLength={5}
            maxLength={300}
            aria-label={kind === "hold" ? "New hold or delay reason" : "New reason for not accepting an order"}
            placeholder={kind === "hold" ? "e.g. We're waiting for a tinplate delivery; we'll update you by Friday." : "e.g. We can't produce this size."}
            className="input min-h-11 flex-1"
          />
          <Button type="submit" disabled={pending} icon="+" variant="secondary" className="whitespace-nowrap text-text">
            Add
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    </div>
  );
}

function EditPreset({ id, text }: { id: string; text: string }) {
  return (
    <Modal
      title="Edit reason"
      trigger={(open) => (
        <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent px-1 text-[12px] underline underline-offset-2">
          Edit
        </button>
      )}
    >
      {(close) => <EditPresetForm id={id} text={text} close={close} />}
    </Modal>
  );
}

function EditPresetForm({ id, text, close }: { id: string; text: string; close: () => void }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updatePreset, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Reason (the customer reads this)" htmlFor="pr-text">
        <textarea id="pr-text" name="text" maxLength={300} defaultValue={text} className="input !min-h-[80px]" />
      </Field>
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

/** A staff member's role, changed on the spot. */
export function RoleSelect({ userId, role }: { userId: string; role: StaffRole }) {
  return (
    <form action={setStaffRole} className="inline">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={role}
        aria-label="Role"
        onChange={(e) => {
          if (confirm(`Change this person's role to ${ROLE_LABELS[e.target.value as StaffRole]}? It changes what they can see and do.`)) e.target.form?.requestSubmit();
          else e.target.value = role;
        }}
        className="input !min-h-8 !py-0.5 text-[12px]"
      >
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </form>
  );
}

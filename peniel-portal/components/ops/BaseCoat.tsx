"use client";

import { usePlant } from "@/components/PlantSettings";
import { useActionState, useState } from "react";
import { sendToPress, startBaseCoat, undoToPress, type PrintRunState } from "@/app/ops/production/sheets/actions";
import PrintRunForm, { type PrintBrand } from "@/components/ops/PrintRunForm";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { BASE_COAT_LABEL, type BaseCoat } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/** `datetime-local` value plus minutes. */
const addMinutes = (local: string, minutes: number) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? new Date(new Date(`${local}:00Z`).getTime() + minutes * 60_000).toISOString().slice(0, 16) : "";

/**
 * 00 · Base coat (brands that need one): a stillage into the big oven for its
 * white or transparent base coat, before it is printed (internal only).
 */
export function BaseCoatDialog({ brands, nextNo, nowLocal, lastTemp }: { brands: PrintBrand[]; nextNo: string; nowLocal: string; lastTemp: number | null }) {
  return (
    <Modal
      wide
      title="00 · Base coat a stillage"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="→" className="w-full whitespace-nowrap text-text">
          00 · Base coat first (white / transparent)
        </Button>
      )}
    >
      {(close) => <BaseCoatForm brands={brands} nextNo={nextNo} nowLocal={nowLocal} lastTemp={lastTemp} close={close} />}
    </Modal>
  );
}

function BaseCoatForm({ brands, nextNo, nowLocal, lastTemp, close }: { brands: PrintBrand[]; nextNo: string; nowLocal: string; lastTemp: number | null; close: () => void }) {
  const { oven_minutes: OVEN_MINUTES, stillage_sheets: STILLAGE_SHEETS } = usePlant();
  const [state, action, pending] = useActionState<PrintRunState, FormData>(startBaseCoat, null);
  // Brands that need a base coat first.
  const sorted = [...brands].sort((a, b) => Number(Boolean(b.baseCoat)) - Number(Boolean(a.baseCoat)));
  const [brandId, setBrandId] = useState(sorted[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [coat, setCoat] = useState<BaseCoat>(brand?.baseCoat ?? "white");
  const [startedAt, setStartedAt] = useState(nowLocal);
  const [alreadyOut, setAlreadyOut] = useState(false);
  const [finishedAt, setFinishedAt] = useState(nowLocal);

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <InternalOnly />
      </div>
      <p className="m-0 text-[13px] opacity-75">Before printing, through the big oven. The stillage then waits for the print line.</p>
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label="Brand" htmlFor="bc-brand">
          <select
            id="bc-brand"
            name="brand_id"
            required
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              const b = brands.find((x) => x.id === e.target.value);
              if (b?.baseCoat) setCoat(b.baseCoat);
            }}
            className="input min-h-11"
          >
            {sorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
                {b.baseCoat ? ` (${b.baseCoat})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stillage no." htmlFor="bc-no">
          <input id="bc-no" name="stillage_no" required maxLength={40} defaultValue={nextNo} className="input min-h-11" />
        </Field>
      </div>
      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] p-0 text-[12px] text-text/70">Base coat</legend>
        <div className="seg !flex">
          {(Object.keys(BASE_COAT_LABEL) as BaseCoat[]).map((c) => (
            <label key={c} className="seg-opt min-h-11 flex-1 justify-center">
              <input type="radio" name="coat" value={c} checked={coat === c} onChange={() => setCoat(c)} />
              {BASE_COAT_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Field label="Sheets" htmlFor="bc-sheets">
          <input id="bc-sheets" name="base_sheets" inputMode="numeric" defaultValue={STILLAGE_SHEETS} className="input min-h-11" />
        </Field>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">Shift</legend>
          <div className="seg !flex">
            {SHIFTS.map((s, i) => (
              <label key={s} className="seg-opt min-h-11 flex-1 justify-center">
                <input type="radio" name="shift" value={s} defaultChecked={i === 0} required />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Oven temperature (°C)" htmlFor="bc-temp">
          <input id="bc-temp" name="oven_temp_c" inputMode="decimal" defaultValue={lastTemp ?? ""} placeholder="e.g. 190" className="input min-h-11" />
        </Field>
      </div>
      <Field label="Into the oven" htmlFor="bc-in">
        <input
          id="bc-in"
          name="started_at"
          type="datetime-local"
          required
          max={nowLocal}
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className="input min-h-11"
        />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={alreadyOut}
          onChange={(e) => {
            setAlreadyOut(e.target.checked);
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
          <Field label="Out of the oven" htmlFor="bc-out">
            <input id="bc-out" name="finished_at" type="datetime-local" required min={startedAt} max={nowLocal} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} className="input min-h-11" />
          </Field>
          <Field label="Sheets spoiled in the base coat" htmlFor="bc-sp">
            <input id="bc-sp" name="sheets_spoiled" inputMode="numeric" placeholder="0" className="input min-h-11" />
          </Field>
        </div>
      )}
      <Field label="Notes (internal)" htmlFor="bc-notes">
        <textarea id="bc-notes" name="notes" maxLength={1000} placeholder="Optional" className="input !min-h-[48px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending || !brandId} icon="→" className="w-[190px]">
            {pending ? "Saving…" : alreadyOut ? "Save the base coat" : "Into the oven"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** "Print it": record the printing of a base-coated stillage waiting for the print line. */
export function PrintItDialog({
  today,
  brands,
  stillage,
  primary,
}: {
  today: string;
  brands: PrintBrand[];
  stillage: { id: string; brandId: string; stillageNo: string; sheets: number | null };
  primary?: boolean;
}) {
  return (
    <Modal
      wide
      title={`01 · Print stillage ${stillage.stillageNo}`}
      trigger={(open) => (
        <Button type="button" variant={primary ? "primary" : "secondary"} onClick={open} icon="→" className={`w-full whitespace-nowrap ${primary ? "" : "text-text"}`}>
          Print it
        </Button>
      )}
    >
      {(close) => <PrintRunForm today={today} brands={brands} nextNo={stillage.stillageNo} fixed={stillage} onDone={close} />}
    </Modal>
  );
}

/** "To the press": a finished stillage leaves the printed-sheet stock for a press. */
export function ToPressDialog({ id, stillageNo, presses, nowLocal, primary }: { id: string; stillageNo: string; presses: { id: string; name: string }[]; nowLocal: string; primary?: boolean }) {
  return (
    <Modal
      title={`Stillage ${stillageNo} to the press`}
      trigger={(open) => (
        <Button type="button" variant={primary ? "primary" : "secondary"} onClick={open} icon="→" className={`w-full whitespace-nowrap ${primary ? "" : "text-text"}`}>
          To the press
        </Button>
      )}
    >
      {(close) => <ToPressForm id={id} presses={presses} nowLocal={nowLocal} close={close} />}
    </Modal>
  );
}

function ToPressForm({ id, presses, nowLocal, close }: { id: string; presses: { id: string; name: string }[]; nowLocal: string; close: () => void }) {
  const [state, action, pending] = useActionState<PrintRunState, FormData>(sendToPress, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Press" htmlFor="tp-press">
          <select id="tp-press" name="press_id" required defaultValue={presses[0]?.id ?? ""} className="input min-h-11">
            {presses.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When" htmlFor="tp-at">
          <input id="tp-at" name="at" type="datetime-local" required max={nowLocal} defaultValue={nowLocal} className="input min-h-11" />
        </Field>
      </div>
      <p className="m-0 text-[12px] opacity-70">The whole stillage leaves the printed-sheet stock.</p>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending || presses.length === 0} icon="→" className="w-[170px]">
            {pending ? "Saving…" : "To the press"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Undo "to the press" (sent by mistake). */
export function UndoToPressButton({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={undoToPress}
      onSubmit={(e) => {
        if (!confirm(`Put stillage ${label} back in stock?`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent-800 underline underline-offset-2">
        undo
      </button>
    </form>
  );
}

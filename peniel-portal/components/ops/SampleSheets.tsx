"use client";

import { useActionState, useState } from "react";
import { deleteSampleSheets, saveSampleSheets, type PrintRunState } from "@/app/ops/production/sheets/actions";
import InkFields from "@/components/ops/InkFields";
import type { PrintBrand } from "@/components/ops/PrintRunForm";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { SAMPLE_PURPOSE, type SamplePurpose } from "@/lib/ink-usage";
import { wholeNumber } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/**
 * Sample sheets (colour match, proof, trial): the sheets and the ink of each
 * colour come off stock; they are not stock for the presses (internal only).
 */
export function SampleSheetsDialog({ today, brands }: { today: string; brands: PrintBrand[] }) {
  return (
    <Modal
      wide
      title="Sample sheets"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="+" className="w-full whitespace-nowrap text-text">
          Sample sheets (colour match, proof, trial)
        </Button>
      )}
    >
      {(close) => <SampleSheetsForm today={today} brands={brands} close={close} />}
    </Modal>
  );
}

function SampleSheetsForm({ today, brands, close }: { today: string; brands: PrintBrand[]; close: () => void }) {
  const [state, action, pending] = useActionState<PrintRunState, FormData>(saveSampleSheets, null);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [sheets, setSheets] = useState("");
  const n = Number.isFinite(wholeNumber(sheets)) ? wholeNumber(sheets) : 0;

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <InternalOnly />
      </div>
      <p className="m-0 text-[13px] opacity-75">Sheets printed as samples. The tinplate and the ink come off the stock; the sheets are not stock for the presses.</p>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Date" htmlFor="ss-date">
          <input id="ss-date" name="sample_date" type="date" defaultValue={today} max={today} required className="input min-h-11" />
        </Field>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-[12px] text-text/70">Shift</legend>
          <div className="seg !flex">
            {SHIFTS.map((s, i) => (
              <label key={s} className="seg-opt min-h-11 flex-1 justify-center">
                <input type="radio" name="shift" value={s} defaultChecked={i === 0} />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="Brand" htmlFor="ss-brand">
          <select id="ss-brand" name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input min-h-11">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option value="">No brand (a trial)</option>
          </select>
        </Field>
        <Field label="For" htmlFor="ss-purpose">
          <select id="ss-purpose" name="purpose" defaultValue="colour_match" className="input min-h-11">
            {(Object.keys(SAMPLE_PURPOSE) as SamplePurpose[]).map((p) => (
              <option key={p} value={p}>
                {SAMPLE_PURPOSE[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Sheets used" htmlFor="ss-sheets">
        <input
          id="ss-sheets"
          name="sheets"
          inputMode="numeric"
          required
          autoComplete="off"
          value={sheets}
          onChange={(e) => setSheets(e.target.value)}
          placeholder="e.g. 25"
          className="input !min-h-[52px] text-[20px] font-extrabold sm:max-w-[200px]"
        />
      </Field>
      {brand && (brand.inks ?? []).length > 0 ? (
        <InkFields key={brandId} inks={brand.inks ?? []} sheets={n} idPrefix="ss-ink" />
      ) : (
        <input type="hidden" name="inks" value="{}" />
      )}
      <Field label="Notes (internal)" htmlFor="ss-notes">
        <textarea id="ss-notes" name="notes" maxLength={1000} placeholder="e.g. new red for the customer's approval" className="input !min-h-[48px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending || n < 1} icon="✓" className="w-[190px]">
            {pending ? "Saving…" : "Save the samples"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Admin: remove sample sheets logged by mistake (their tinplate and ink go back on the stock). */
export function DeleteSampleButton({ id }: { id: string }) {
  return (
    <form
      action={deleteSampleSheets}
      onSubmit={(e) => {
        if (!confirm("Delete these sample sheets? Their tinplate and ink go back on the stock.")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
        Delete
      </button>
    </form>
  );
}

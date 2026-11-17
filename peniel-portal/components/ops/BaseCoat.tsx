"use client";

import { usePlant } from "@/components/PlantSettings";
import { useActionState, useState } from "react";
import { sendToPress, startBaseCoat, undoToPress, type PrintRunState } from "@/app/ops/production/sheets/actions";
import PrintRunForm, { type CoatedStillage, type PrintBrand } from "@/components/ops/PrintRunForm";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { BASE_COAT_LABEL, MAX_OVEN_AT_ONCE, stillageNumbers, stillagesFromTotal, wholeNumber, type BaseCoat } from "@/lib/print-runs";
import { SHIFTS } from "@/lib/production-math";

/** `datetime-local` value plus minutes. */
const addMinutes = (local: string, minutes: number) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? new Date(new Date(`${local}:00Z`).getTime() + minutes * 60_000).toISOString().slice(0, 16) : "";

/**
 * 00 · Base coat (brands that need one): a stillage into the big oven for its
 * white or transparent base coat, before it is printed (internal only).
 */
export function BaseCoatDialog({ brands, nextNo, nowLocal, lastTemp, stock }: { brands: PrintBrand[]; nextNo: string; nowLocal: string; lastTemp: number | null; stock?: boolean }) {
  return (
    <Modal
      wide
      title={stock ? "00 · Base coat only, brand later" : "00 · Base coat for a brand"}
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="→" className="w-full whitespace-nowrap text-text">
          {stock ? "00 · Base coat only (brand later)" : "00 · Base coat first, for a brand"}
        </Button>
      )}
    >
      {(close) => <BaseCoatForm brands={brands} nextNo={nextNo} nowLocal={nowLocal} lastTemp={lastTemp} close={close} stock={stock} />}
    </Modal>
  );
}

function BaseCoatForm({
  brands,
  nextNo,
  nowLocal,
  lastTemp,
  close,
  stock,
}: {
  brands: PrintBrand[];
  nextNo: string;
  nowLocal: string;
  lastTemp: number | null;
  close: () => void;
  stock?: boolean;
}) {
  const { oven_minutes: OVEN_MINUTES, stillage_sheets: STILLAGE_SHEETS } = usePlant();
  const [state, action, pending] = useActionState<PrintRunState, FormData>(startBaseCoat, null);
  // Brands that need a base coat first.
  const sorted = [...brands].sort((a, b) => Number(Boolean(b.baseCoat)) - Number(Boolean(a.baseCoat)));
  const [brandId, setBrandId] = useState(sorted[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [coat, setCoat] = useState<BaseCoat>((!stock && brand?.baseCoat) || "white");
  const [startedAt, setStartedAt] = useState(nowLocal);
  const [alreadyOut, setAlreadyOut] = useState(false);
  const [finishedAt, setFinishedAt] = useState(nowLocal);
  // How much: a number of stillages, or the day's total of sheets cut into stillages.
  const [amount, setAmount] = useState<"stillages" | "total">("stillages");
  const [count, setCount] = useState("1");
  const [each, setEach] = useState(String(STILLAGE_SHEETS));
  const [total, setTotal] = useState("");
  const [first, setFirst] = useState(nextNo);
  const per = wholeNumber(each);
  const sizes =
    amount === "total"
      ? stillagesFromTotal(wholeNumber(total), per)
      : Number.isFinite(wholeNumber(count)) && wholeNumber(count) >= 1 && per > 0
        ? Array.from({ length: Math.min(wholeNumber(count), MAX_OVEN_AT_ONCE + 1) }, () => per)
        : [];
  const numbers = sizes.length ? stillageNumbers(first, sizes.length) : null;
  const sheetsAll = sizes.reduce((t, x) => t + x, 0);
  const tooMany = sizes.length > MAX_OVEN_AT_ONCE;
  const nf = (x: number) => x.toLocaleString("en-US");
  const shape = (() => {
    if (!sizes.length) return "";
    const full = sizes.filter((x) => x === sizes[0]).length;
    const rest = sizes.length > full ? sizes[sizes.length - 1] : null;
    return `${full} × ${nf(sizes[0])}${rest ? ` + 1 × ${nf(rest)}` : ""}`;
  })();

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <InternalOnly />
      </div>
      {stock ? (
        <>
          <input type="hidden" name="stock" value="1" />
          <p className="m-0 text-[13px] opacity-75">
            Plain tinplate through the big oven with a white or transparent base coat, before the brand is known. The stillage waits in base-coated stock; the brand is
            chosen when it is printed.
          </p>
          <Field label={sizes.length > 1 ? "First stillage no." : "Stillage no."} htmlFor="bc-no">
            <input id="bc-no" name="stillage_no" required maxLength={40} value={first} onChange={(e) => setFirst(e.target.value)} className="input min-h-11 sm:max-w-[200px]" />
          </Field>
        </>
      ) : (
      <>
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
        <Field label={sizes.length > 1 ? "First stillage no." : "Stillage no."} htmlFor="bc-no">
          <input id="bc-no" name="stillage_no" required maxLength={40} value={first} onChange={(e) => setFirst(e.target.value)} className="input min-h-11" />
        </Field>
      </div>
      </>
      )}
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
      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] p-0 text-[12px] text-text/70">How much</legend>
        <div className="seg !flex">
          <label className="seg-opt min-h-11 flex-1 justify-center">
            <input type="radio" name="amount" value="stillages" checked={amount === "stillages"} onChange={() => setAmount("stillages")} />
            Stillages
          </label>
          <label className="seg-opt min-h-11 flex-1 justify-center">
            <input
              type="radio"
              name="amount"
              value="total"
              checked={amount === "total"}
              onChange={() => {
                setAmount("total");
                // A day's total is logged after the fact.
                if (!alreadyOut) {
                  setAlreadyOut(true);
                  if (startedAt === nowLocal) setStartedAt(addMinutes(nowLocal, -OVEN_MINUTES));
                  setFinishedAt(nowLocal);
                }
              }}
            />
            Day&apos;s total of sheets
          </label>
        </div>
      </fieldset>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {amount === "total" ? (
          <Field label="Total sheets base coated" htmlFor="bc-total" hint="e.g. the whole day's base coat">
            <input id="bc-total" name="total_sheets" inputMode="numeric" autoComplete="off" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 21,000" className="input min-h-11" />
          </Field>
        ) : (
          <Field label="Stillages" htmlFor="bc-count" hint={`Up to ${MAX_OVEN_AT_ONCE} at a time`}>
            <input id="bc-count" name="stillages" inputMode="numeric" autoComplete="off" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))} className="input min-h-11" />
          </Field>
        )}
        <Field label="Sheets a stillage" htmlFor="bc-sheets" hint={amount === "total" ? "The most one stillage takes into the oven" : undefined}>
          <input id="bc-sheets" name="base_sheets" inputMode="numeric" autoComplete="off" value={each} onChange={(e) => setEach(e.target.value)} className="input min-h-11" />
        </Field>
      </div>
      {sizes.length > 0 && (
        <p className={`m-0 px-3 py-2 text-[13px] ${tooMany || (sizes.length > 1 && !numbers) ? "bg-accent-100 font-bold text-accent-800" : "bg-surface"}`}>
          {tooMany
            ? `That makes ${sizes.length} stillages; up to ${MAX_OVEN_AT_ONCE} at a time.`
            : sizes.length > 1 && !numbers
              ? "End the first stillage number with a number (e.g. ST-014) to number them on."
              : `${sizes.length === 1 ? "1 stillage" : `${sizes.length} stillages (${shape})`}, ${nf(sheetsAll)} sheets${numbers && numbers.length > 1 ? `: ${numbers[0]} to ${numbers[numbers.length - 1]}` : ""}`}
        </p>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
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
        {sizes.length > 1 ? "They have already come out (log the whole pass now)" : "It has already come out (log the whole pass now)"}
      </label>
      {alreadyOut && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Out of the oven" htmlFor="bc-out">
            <input id="bc-out" name="finished_at" type="datetime-local" required min={startedAt} max={nowLocal} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} className="input min-h-11" />
          </Field>
          <Field label={sizes.length > 1 ? "Sheets spoiled in the base coat (all)" : "Sheets spoiled in the base coat"} htmlFor="bc-sp">
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
          <Button type="submit" disabled={pending || (!stock && !brandId) || !sizes.length || tooMany || (sizes.length > 1 && !numbers)} icon="→" className="w-[210px]">
            {pending ? "Saving…" : alreadyOut ? (sizes.length > 1 ? `Save ${sizes.length} stillages` : "Save the base coat") : "Into the oven"}
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
  stillage: { id: string; brandId: string; stillageNo: string; sheets: number | null; coat?: BaseCoat | null };
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

/** Print several base-coated stillages at once: choose the brand, tick the stillages. */
export function PrintSeveralDialog({ today, brands, stillages }: { today: string; brands: PrintBrand[]; stillages: CoatedStillage[] }) {
  return (
    <Modal
      wide
      title="01 · Print base-coated stillages"
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="→" className="whitespace-nowrap text-text">
          Print several
        </Button>
      )}
    >
      {(close) => <PrintRunForm today={today} brands={brands} nextNo="" pick={stillages} onDone={close} />}
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

"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { saveInspection, type QcState } from "@/app/ops/quality/actions";
import { CustomerWarning, type Preset } from "@/components/ops/OrderForms";
import { Pill } from "@/components/ui/StatusBadge";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { formatDate } from "@/lib/format";
import { rejectPct, REJECT_LIMIT_PCT } from "@/lib/production-math";
import { checkMeasure, coaFindings, COA_DOCUMENT, DEFECT_SAMPLE, MEASURES, RESULT_PILL, VISUAL_SAMPLE } from "@/lib/qc";

export type InspectionInitial = {
  id?: string;
  batch_no: string;
  order_id: string;
  inspected_at: string; // datetime-local value, Addis Ababa time
  sample_size: string;
  measurements: Record<string, string>;
  defects: Record<string, string>;
  result: "" | "released" | "on_hold";
  customer_reason: string;
  internal_notes: string;
  published: boolean;
};


const num = (v: string) => Number(String(v).replace(/[,\s]/g, "") || 0);

/** Log or edit a batch inspection and its release decision (design 1j). */
export default function InspectionForm({
  initial,
  orders,
  defectTypes,
  presets,
  canEdit,
}: {
  initial: InspectionInitial;
  orders: { id: string; label: string }[];
  defectTypes: { code: string; customer_label: string }[];
  presets: Preset[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<QcState, FormData>(saveInspection, null);
  const [sample, setSample] = useState(initial.sample_size);
  const [measures, setMeasures] = useState(initial.measurements);
  const [defects, setDefects] = useState(initial.defects);
  const [result, setResult] = useState(initial.result);
  const [reason, setReason] = useState(initial.customer_reason);
  const [batch, setBatch] = useState(initial.batch_no);
  const [at, setAt] = useState(initial.inspected_at);

  const total = Object.values(defects).reduce((s, v) => s + num(v), 0);
  const size = num(sample);
  const pct = rejectPct(total, size);
  const over = pct > REJECT_LIMIT_PCT;
  const pill = result ? RESULT_PILL[result] : RESULT_PILL.none;
  const findings = coaFindings(
    Object.fromEntries(Object.entries(measures).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v.replace(",", "."))])),
    Object.fromEntries(Object.entries(defects).map(([k, v]) => [k, num(v)])),
    new Map(defectTypes.map((d) => [d.code, d.customer_label])),
  );
  const measured = Object.values(measures).filter((v) => v !== "").length;

  return (
    <form action={action} className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_460px]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <fieldset disabled={!canEdit} className="m-0 flex min-w-0 flex-col gap-5 border-0 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
        <div className="grid gap-3.5 sm:grid-cols-2 2xl:grid-cols-[1fr_1.4fr_1fr_1.3fr]">
          <div className="field">
            <label htmlFor="qc-batch">Batch</label>
            <input id="qc-batch" name="batch_no" required maxLength={40} value={batch} onChange={(e) => setBatch(e.target.value)} className="input" />
          </div>
          <div className="field">
            <label htmlFor="qc-order">Order</label>
            <select id="qc-order" name="order_id" required defaultValue={initial.order_id} className="input">
              <option value="">Choose an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="qc-sample">Sample size (crowns)</label>
            <input id="qc-sample" name="sample_size" inputMode="numeric" required value={sample} onChange={(e) => setSample(e.target.value)} className="input" />
          </div>
          <div className="field">
            <label htmlFor="qc-at">Inspected</label>
            <input id="qc-at" name="inspected_at" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h5 className="m-0">
              Measurements <span className="text-[12px] font-normal opacity-60">· Certificate of Analysis {COA_DOCUMENT}</span>
            </h5>
            <InternalOnly>Spec values internal · customers see only the result</InternalOnly>
          </div>
          <div className="overflow-x-auto">
          <div className="min-w-[560px]">
          <div className="th-row grid grid-cols-[minmax(0,1fr)_56px_150px_120px_90px] gap-3 border-b-2 border-divider py-1.5">
            <span>Parameter</span>
            <span>Sample</span>
            <span>Result</span>
            <span>Standard</span>
            <span>Check</span>
          </div>
          {MEASURES.map((m) => {
            const raw = measures[m.key] ?? "";
            const check = raw ? checkMeasure(m, Number(raw.replace(",", "."))) : null;
            return (
              <div key={m.key} className="grid grid-cols-[minmax(0,1fr)_56px_150px_120px_90px] items-center gap-3 border-b border-divider py-1.5 text-[14px]">
                <label htmlFor={`m-${m.key}`}>{m.label}</label>
                <span className="text-[12px] opacity-60">{m.sample}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    id={`m-${m.key}`}
                    name={`m_${m.key}`}
                    inputMode="decimal"
                    value={raw}
                    onChange={(e) => setMeasures({ ...measures, [m.key]: e.target.value })}
                    className="input"
                  />
                  <span className="text-[12px] opacity-60">{m.unit}</span>
                </span>
                <span className="text-[13px] opacity-70">
                  {m.spec} {m.unit}
                </span>
                <span className={clsx("text-[12px] font-extrabold", check && check !== "ok" ? "text-accent-700" : "text-neutral-700")}>
                  {check === "ok" ? "✓ in spec" : check ? `⚠ ${check}` : ""}
                </span>
              </div>
            );
          })}
          </div>
          </div>
        </div>

        <div>
          <h5 className="mb-1.5 mt-0">
            Visual checks · defects found{" "}
            <span className="text-[12px] font-normal opacity-60">
              (standard 0% · sample {VISUAL_SAMPLE}
              {Object.keys(DEFECT_SAMPLE).length ? `, corrosion ${DEFECT_SAMPLE.corrosion}` : ""})
            </span>
          </h5>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {defectTypes.map((d) => (
              <label key={d.code} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2 bg-surface px-2.5 py-2 text-[13px]">
                <span>
                  {d.customer_label}
                  {DEFECT_SAMPLE[d.code] && <span className="block text-[11px] opacity-60">sample {DEFECT_SAMPLE[d.code]}</span>}
                </span>
                <input
                  name={`d_${d.code}`}
                  inputMode="numeric"
                  value={defects[d.code] ?? ""}
                  placeholder="0"
                  onChange={(e) => setDefects({ ...defects, [d.code]: e.target.value.replace(/\D/g, "") })}
                  className="input !bg-bg font-extrabold"
                />
              </label>
            ))}
          </div>
          <div
            className={clsx(
              "mt-2.5 flex flex-wrap justify-between gap-2 px-3 py-2.5 text-[14px]",
              over ? "bg-accent-100 text-accent-800" : "bg-surface",
            )}
          >
            <span>
              Total rejects {total.toLocaleString("en-US")} of {size ? size.toLocaleString("en-US") : "—"}
            </span>
            <b>
              Reject rate {size ? `${pct.toFixed(2)}%` : "—"}
              {over && ` · over the ${REJECT_LIMIT_PCT.toFixed(2)}% limit`}
            </b>
          </div>
        </div>

        <div className="field">
          <label htmlFor="qc-notes" className="!flex justify-between gap-2">
            Internal notes
            <InternalOnly>Never visible to customers</InternalOnly>
          </label>
          <textarea id="qc-notes" name="internal_notes" defaultValue={initial.internal_notes} maxLength={4000} className="input !min-h-[72px]" />
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 bg-surface px-4 py-6 sm:px-8 xl:pl-6">
        <div
          className={clsx("flex flex-col gap-1 px-3 py-2.5 text-[13px]", findings.length ? "bg-accent-100 text-accent-800" : "bg-bg")}
          role="status"
        >
          <b>
            {findings.length
              ? `Does not conform to the CoA · ${findings.length} finding${findings.length === 1 ? "" : "s"}`
              : measured
                ? `Conforms to the CoA so far (${measured} of ${MEASURES.length} parameters measured)`
                : "Enter the measurements to check against the CoA"}
          </b>
          {findings.map((f) => (
            <span key={f}>· {f}</span>
          ))}
          <span className="flex items-center gap-1 text-[11px] opacity-70">Internal: customers see only the release decision and defect counts.</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="m-0">Release decision</h4>
          <CustomerSees />
        </div>
        <div className="grid grid-cols-3 border-2 border-text">
          {(
            [
              ["", "Not decided"],
              ["released", "Released"],
              ["on_hold", "❚❚ On hold"],
            ] as const
          ).map(([v, label], i) => (
            <label
              key={v || "none"}
              className={clsx(
                "flex cursor-pointer items-center justify-center gap-2 p-3 text-center text-[14px] font-extrabold",
                i && "border-l-2 border-text",
                result === v ? (v === "on_hold" ? "bg-accent-800 text-bg" : "bg-text text-bg") : "bg-bg",
              )}
            >
              <input type="radio" name="result" value={v} checked={result === v} onChange={() => setResult(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {result === "on_hold" && presets.length > 0 && (
          <div className="field">
            <label htmlFor="qc-preset">Reason preset</label>
            <select id="qc-preset" className="input !bg-bg" defaultValue="" onChange={(e) => e.target.value && setReason(e.target.value)}>
              <option value="">Choose a preset, or write your own</option>
              {presets.map((p) => (
                <option key={p.id} value={p.text}>
                  {p.text}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="qc-reason" className="!flex justify-between gap-2">
            Customer-facing reason
            <span className="text-[11px] text-accent-800">{result === "on_hold" ? "required" : "optional"}</span>
          </label>
          <textarea
            id="qc-reason"
            name="customer_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={result === "on_hold"}
            maxLength={1000}
            className="input !min-h-20 !bg-bg"
          />
        </div>
        <div className="bg-bg">
          <CustomerWarning boxed />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] opacity-60">Customer preview · Production › Quality</span>
          <div className="border border-divider bg-bg p-2.5 text-[13px]">
            <div className="grid grid-cols-[80px_1fr_70px_auto] items-center gap-2 border-b border-divider pb-2">
              <b className="truncate">{batch || "Batch"}</b>
              <span>{at ? formatDate(at.slice(0, 10)) : "—"}</span>
              <span className={clsx("font-extrabold", over && "text-accent-700")}>{size ? `${pct.toFixed(2)}%` : "—"}</span>
              <Pill style={pill.style}>{pill.label}</Pill>
            </div>
            <div className={clsx("pt-2", result === "on_hold" ? "text-accent-800" : "opacity-70")}>
              {reason.trim() || (result === "on_hold" ? "Your reason appears here." : "No message.")}
            </div>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" name="published" defaultChecked={initial.published} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
          <span>Publish batch result and defect summary to the customer</span>
        </label>
        <FormMessage state={state} />
        {canEdit && (
          <Button type="submit" disabled={pending} icon={result === "on_hold" ? "❚❚" : result === "released" ? "✓" : "→"} className="px-4 py-3.5">
            {pending ? "Saving…" : result === "on_hold" ? "Save & hold batch" : result === "released" ? "Save & release batch" : "Save inspection"}
          </Button>
        )}
      </fieldset>
    </form>
  );
}

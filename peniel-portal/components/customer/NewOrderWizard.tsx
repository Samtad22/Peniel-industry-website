"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { submitOrder } from "@/app/(customer)/orders/actions";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import Crown from "@/components/ui/Crown";
import { Button } from "@/components/ui/form";
import {
  ACCEPT,
  ATTACHMENT_TYPE_LABELS,
  fileExt,
  fileProblem,
  formatBytes,
  safeFileName,
  type AttachmentType,
} from "@/lib/files";
import { formatDate, formatQty } from "@/lib/format";
import { uploadToStorage } from "@/lib/upload";

export type WizardBrand = {
  id: string;
  name: string;
  spec: string;
  size: string;
  finish: string | null;
  liner: string;
  colours: string[];
};

export type WizardRecent = {
  id: string;
  order_no: string;
  brand_id: string;
  brand_name: string;
  quantity: number;
  due_date: string | null;
  delivery_method: "pickup" | "delivery";
  delivery_address: string | null;
};

export type WizardInitial = {
  step: 1 | 2 | 3 | 4;
  brandId?: string;
  reorderFrom?: string;
  poFrom?: {
    order_no: string;
    po_number: string;
    files: { name: string; path: string; size: number; type: AttachmentType }[];
  };
};

type Step = 1 | 2 | 3 | 4;

type FileItem = {
  key: string;
  name: string;
  size: number;
  type: AttachmentType;
  status: "uploading" | "done" | "failed";
  progress: number;
  error?: string;
  path?: string;
  /** Set when the file is reused from another order on the same PO. */
  fromOrder?: string;
  /** A failed upload that can be tried again (not a too-large or wrong-type file). */
  retryable?: boolean;
};

const STEPS = ["Product", "Specs & quantity", "PO & attachments", "Review & submit"];

const digits = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "");

function Stepper({ step, onGo }: { step: Step; onGo: (s: Step) => void }) {
  return (
    <ol className="m-0 flex list-none overflow-x-auto border-2 border-text p-0 max-lg:w-full">
      {STEPS.map((label, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        return (
          <li key={label} className={clsx("shrink-0", i && "border-l-2 border-divider")}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onGo(n)}
              aria-current={n === step ? "step" : undefined}
              className={clsx(
                "whitespace-nowrap border-0 px-3.5 py-2 text-[13px] disabled:cursor-default",
                done && "cursor-pointer bg-text text-bg",
                n === step && "bg-accent font-extrabold text-bg",
                n > step && "bg-transparent text-text",
              )}
            >
              {done ? "✓ " : `${n} `}
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ rows }: { rows: [string, string | null][] }) {
  return (
    <aside className="bg-surface px-4 py-6 sm:px-8 lg:py-8">
      <h6 className="mb-2.5 mt-0">Order summary</h6>
      <div className="border-t-2 border-divider">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-b border-divider py-2 text-[13px]">
            <span className="opacity-60">{k}</span>
            <span className={v ? "font-extrabold" : "opacity-40"}>{v || "—"}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Nav({
  back,
  next,
  nextLabel,
  canNext,
  hint,
}: {
  back: React.ReactNode;
  next: () => void;
  nextLabel: string;
  canNext: boolean;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-divider pt-5">
      {back}
      <div className="flex flex-wrap items-center justify-end gap-3.5">
        {hint && <span className="text-[12px] text-accent-800">{hint}</span>}
        <Button type="button" onClick={next} disabled={!canNext} icon="→" className="w-[260px] px-4 py-3.5">
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

/** New order — four steps and a submit (customer designs 1e–1h). */
export default function NewOrderWizard({
  companyId,
  brands,
  recent,
  initial,
  minDate,
}: {
  companyId: string;
  brands: WizardBrand[];
  recent: WizardRecent[];
  initial: WizardInitial;
  minDate: string;
}) {
  const reorder = recent.find((r) => r.id === initial.reorderFrom);
  const [step, setStep] = useState<Step>(initial.step);
  const [brandId, setBrandId] = useState<string | null>(initial.brandId ?? reorder?.brand_id ?? null);
  const [reorderFrom, setReorderFrom] = useState<string | null>(reorder?.id ?? null);
  const [quantity, setQuantity] = useState(reorder ? String(reorder.quantity) : "");
  const [requestedDate, setRequestedDate] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">(reorder?.delivery_method ?? "pickup");
  const [address, setAddress] = useState(reorder?.delivery_address ?? "");
  const [poNumber, setPoNumber] = useState(initial.poFrom?.po_number ?? "");
  const [files, setFiles] = useState<FileItem[]>(
    (initial.poFrom?.files ?? []).map((f, i) => ({
      key: `from-${i}`,
      name: f.name,
      size: f.size,
      type: f.type,
      status: "done",
      progress: 100,
      path: f.path,
      fromOrder: initial.poFrom?.order_no,
    })),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const blobs = useRef(new Map<string, File>());
  const inputRef = useRef<HTMLInputElement>(null);

  const brand = brands.find((b) => b.id === brandId) ?? null;
  const qty = Number(digits(quantity) || 0);
  const addressNeeded = fulfilment === "delivery";
  const dateOk = !requestedDate || requestedDate >= minDate;
  const poFile = files.some((f) => f.type === "purchase_order" && f.status === "done");
  const uploading = files.some((f) => f.status === "uploading");
  const failedPo = files.find((f) => f.status === "failed" && f.type === "purchase_order");
  const ready = files.filter((f) => f.status === "done");

  const step1Ok = Boolean(brand);
  const step2Ok = qty > 0 && dateOk && (!addressNeeded || address.trim().length > 0);
  const step3Ok = poNumber.trim().length > 0 && poFile && !uploading && ready.length <= 10;

  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  const update = (key: string, patch: Partial<FileItem>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const startUpload = (key: string) => {
    const file = blobs.current.get(key);
    if (!file) return;
    const path = `${companyId}/uploads/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    update(key, { status: "uploading", progress: 0, error: undefined });
    uploadToStorage("order-attachments", file, path, (progress) => update(key, { progress }))
      .then(() => update(key, { status: "done", progress: 100, path }))
      .catch((e: Error) => update(key, { status: "failed", error: e.message, retryable: true }));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const hasPo = files.some((f) => f.type === "purchase_order" && f.status !== "failed");
    Array.from(list).forEach((file, i) => {
      const key = `${Date.now()}-${i}-${file.name}`;
      const problem = fileProblem(file);
      const item: FileItem = {
        key,
        name: file.name,
        size: file.size,
        // The first file is taken to be the PO; the customer can change it.
        type: !hasPo && i === 0 ? "purchase_order" : /\.xlsx$/i.test(file.name) ? "specification" : "other",
        status: problem ? "failed" : "uploading",
        progress: 0,
        error: problem ?? undefined,
      };
      setFiles((prev) => [...prev, item]);
      if (!problem) {
        blobs.current.set(key, file);
        startUpload(key);
      }
    });
  };

  const submit = () => {
    if (!brand || !confirmed) return;
    setError(null);
    startTransition(async () => {
      const res = await submitOrder({
        brandId: brand.id,
        poNumber: poNumber.trim(),
        quantity: qty,
        requestedDate: requestedDate || null,
        deliveryMethod: fulfilment,
        deliveryAddress: fulfilment === "delivery" ? address.trim() : "",
        attachments: ready.map((f) => ({ path: f.path!, name: f.name, size: f.size, type: f.type })),
      });
      if (res?.error) setError(res.error);
    });
  };

  const summary: [string, string | null][] = [
    ["Brand", brand?.name ?? null],
    ["Crown", brand ? brand.spec : null],
    ["Liner", brand?.liner ?? null],
    ["Quantity", qty ? `${qty.toLocaleString("en-US")} crowns` : null],
    ["Fulfilment", step > 1 || reorderFrom ? (fulfilment === "delivery" ? "Delivery" : "Pickup at Bole Lemi") : null],
    ["Requested", requestedDate ? formatDate(requestedDate) : null],
    ["PO number", poNumber.trim() || null],
    [
      "Attachments",
      files.length
        ? [`${ready.length} file${ready.length === 1 ? "" : "s"}`, files.some((f) => f.status === "failed") && "1+ failed"]
            .filter(Boolean)
            .join(" · ")
        : null,
    ],
  ];

  const back = (to: Step | null, label = "← Back") =>
    to ? (
      <button type="button" className="btn btn-ghost" onClick={() => go(to)}>
        {label}
      </button>
    ) : (
      <Link href="/orders" className="btn btn-ghost">
        ← Cancel
      </Link>
    );

  return (
    <>
      <CustomerPageHead section="Orders" title="New order" aside={<Stepper step={step} onGo={go} />} />

      {step < 4 && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6 px-4 pb-10 pt-8 sm:px-10 lg:border-r-2 lg:border-divider">
            {step === 1 && (
              <>
                {initial.poFrom && (
                  <p className="m-0 bg-neutral-200 px-3.5 py-2.5 text-[13px] text-neutral-800">
                    Ordering another brand on PO <b>{initial.poFrom.po_number}</b> (from {initial.poFrom.order_no}). The PO
                    file is already attached.
                  </p>
                )}
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-3 p-0 font-heading text-[20px] font-extrabold">Choose a brand</legend>
                  {brands.length === 0 && (
                    <p className="m-0 text-[14px]">
                      There are no brands on your account yet. Please contact Peniel to set one up.
                    </p>
                  )}
                  <div className="grid grid-cols-2 border-t-2 border-divider md:grid-cols-4">
                    {brands.map((b) => {
                      const on = b.id === brandId;
                      return (
                        <label
                          key={b.id}
                          className={clsx(
                            "flex cursor-pointer flex-col gap-1.5 border-b border-r border-divider p-4",
                            on ? "bg-neutral-200 shadow-[inset_0_0_0_2px_var(--color-text)]" : "hover:bg-text/5",
                          )}
                        >
                          <input
                            type="radio"
                            name="brand"
                            value={b.id}
                            checked={on}
                            onChange={() => {
                              setBrandId(b.id);
                              setReorderFrom(null);
                            }}
                            className="sr-only"
                          />
                          <Crown colours={b.colours} size={40} />
                          <span className="text-[10px] uppercase tracking-[0.1em] text-accent-700">{b.spec}</span>
                          <b className="text-[15px]">{b.name}</b>
                          <span className="text-[12px] opacity-70">{b.liner} liner</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {recent.length > 0 && (
                  <fieldset className="m-0 border-0 p-0">
                    <legend className="mb-3 p-0 font-heading text-[20px] font-extrabold">Or reorder a recent order</legend>
                    <div className="border-t-2 border-divider">
                      {recent.slice(0, 4).map((r) => (
                        <label
                          key={r.id}
                          className="grid cursor-pointer grid-cols-[28px_96px_minmax(0,1fr)_90px] items-center gap-3 border-b border-divider py-3 text-[14px] hover:bg-text/5 sm:grid-cols-[28px_110px_minmax(0,1fr)_120px_110px]"
                        >
                          <input
                            type="radio"
                            name="reorder"
                            checked={reorderFrom === r.id}
                            onChange={() => {
                              setReorderFrom(r.id);
                              setBrandId(r.brand_id);
                              setQuantity(String(r.quantity));
                              setFulfilment(r.delivery_method);
                              setAddress(r.delivery_address ?? "");
                            }}
                            className="size-4 accent-[var(--color-accent)]"
                          />
                          <b>{r.order_no}</b>
                          <span className="truncate">{r.brand_name}</span>
                          <span>{r.quantity.toLocaleString("en-US")}</span>
                          <span className="opacity-60 max-sm:hidden">{formatDate(r.due_date)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <p className="m-0 text-[13px] opacity-70">
                  New brand or a new printed design? Contact Peniel and we&apos;ll set it up on your account first.
                </p>
                <Nav
                  back={back(null)}
                  next={() => go(2)}
                  nextLabel="Next: specs & quantity"
                  canNext={step1Ok}
                  hint={step1Ok ? null : "Choose a brand to continue"}
                />
              </>
            )}

            {step === 2 && brand && (
              <>
                <div>
                  <h4 className="mb-3 mt-0">{brand.name}</h4>
                  <div className="grid grid-cols-2 border-l border-t border-divider sm:grid-cols-4">
                    {[
                      ["Size", brand.size],
                      ["Liner", brand.liner],
                      ["Finish", brand.finish ?? "—"],
                      ["Colours", brand.colours.length ? brand.colours.join(", ") : "As on file"],
                    ].map(([k, v]) => (
                      <div key={k} className="border-b border-r border-divider px-3.5 py-3">
                        <div className="text-[11px] uppercase tracking-[0.08em] opacity-60">{k}</div>
                        <div className="mt-1 text-[15px] font-extrabold">{v}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mb-0 mt-2 text-[12px] opacity-70">
                    These are your brand&apos;s specs on file at Peniel. To change them, contact Peniel before ordering.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="qty">Quantity (crowns)</label>
                    <input
                      id="qty"
                      inputMode="numeric"
                      autoComplete="off"
                      value={qty ? qty.toLocaleString("en-US") : quantity}
                      onChange={(e) => setQuantity(digits(e.target.value))}
                      placeholder="e.g. 4,000,000"
                      className="input min-h-11 text-[18px] font-extrabold"
                    />
                    <p className="mb-0 mt-1.5 text-[12px] opacity-70">{qty ? `${formatQty(qty)} crowns` : "Number of crowns"}</p>
                  </div>
                  <div className="field">
                    <label htmlFor="req-date">Requested delivery date</label>
                    <input
                      id="req-date"
                      type="date"
                      min={minDate}
                      value={requestedDate}
                      onChange={(e) => setRequestedDate(e.target.value)}
                      className="input min-h-11"
                      aria-invalid={!dateOk}
                    />
                    <p className={clsx("mb-0 mt-1.5 text-[12px]", dateOk ? "opacity-70" : "font-extrabold text-accent-800")}>
                      {dateOk ? "Optional. Peniel confirms the due date." : "Choose today or a later date."}
                    </p>
                  </div>
                </div>

                <fieldset className="field m-0 border-0 p-0">
                  <legend className="mb-[5px] p-0 text-[12px] text-text/70">Fulfilment</legend>
                  <div className="grid border border-divider sm:grid-cols-2">
                    {(
                      [
                        ["pickup", "Pickup at Bole Lemi", "Collect from Peniel's warehouse, Addis Ababa"],
                        ["delivery", "Delivery", "Peniel arranges transport to your site"],
                      ] as const
                    ).map(([v, title, sub], i) => (
                      <label
                        key={v}
                        className={clsx(
                          "flex cursor-pointer flex-col gap-1 p-3.5 text-[13px]",
                          i && "border-divider max-sm:border-t sm:border-l",
                          fulfilment === v && "bg-accent-100",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="fulfilment"
                            checked={fulfilment === v}
                            onChange={() => setFulfilment(v)}
                            className="size-4 accent-[var(--color-accent)]"
                          />
                          <b>{title}</b>
                        </span>
                        <span className="opacity-70">{sub}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {addressNeeded && (
                  <div className="field">
                    <label htmlFor="address">Delivery address and receiving contact</label>
                    <textarea
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      maxLength={500}
                      placeholder="Site, gate, receiving hours, contact name and phone"
                      className="input !min-h-[72px]"
                    />
                  </div>
                )}

                <Nav
                  back={back(1)}
                  next={() => go(3)}
                  nextLabel="Next: PO & attachments"
                  canNext={step2Ok}
                  hint={
                    step2Ok
                      ? null
                      : !qty
                        ? "Enter the number of crowns"
                        : addressNeeded && !address.trim()
                          ? "Add the delivery address"
                          : null
                  }
                />
              </>
            )}

            {step === 3 && (
              <>
                {failedPo && (
                  <div role="alert" className="grid items-center gap-x-4 gap-y-1 bg-accent px-4 py-3.5 text-bg sm:grid-cols-[1fr_auto]">
                    <b className="text-[15px]">Your purchase order didn&apos;t upload.</b>
                    {failedPo.retryable && (
                      <button
                        type="button"
                        onClick={() => startUpload(failedPo.key)}
                        className="btn bg-bg text-text hover:bg-neutral-200 hover:text-text sm:row-span-2"
                      >
                        Retry upload ↻
                      </button>
                    )}
                    <span className="text-[13px]">
                      {failedPo.name}: {failedPo.error}.{" "}
                      {fileProblem(failedPo) ? "Compress or split the file, then add it again." : ""}
                    </span>
                  </div>
                )}

                <div className="field max-w-[420px]">
                  <label htmlFor="po-number">
                    Customer PO number <b className="text-accent-700">*</b>
                  </label>
                  <input
                    id="po-number"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    maxLength={60}
                    className="input min-h-11 font-extrabold"
                    autoComplete="off"
                  />
                </div>

                <div className="field">
                  <label htmlFor="files">Attachments</label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    className={clsx(
                      "flex flex-wrap items-center justify-between gap-3 border-2 border-dashed p-5 sm:p-7",
                      dragging ? "border-accent bg-accent-100" : "border-divider bg-neutral-100",
                    )}
                  >
                    <div>
                      <b className="text-[16px]">
                        <span className="max-sm:hidden">Drag files here or </span>
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="cursor-pointer border-0 bg-transparent p-0 font-extrabold text-accent underline underline-offset-2"
                        >
                          browse
                        </button>
                      </b>
                      <div className="mt-1 text-[12px] opacity-70">
                        PDF, JPG, PNG, XLSX, DOCX · up to 20 MB each · a purchase order is required
                      </div>
                    </div>
                    <span className="font-mono text-[11px] font-semibold opacity-50">↑ UPLOAD</span>
                    <input
                      ref={inputRef}
                      id="files"
                      type="file"
                      multiple
                      accept={ACCEPT}
                      className="sr-only"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                {files.length > 0 && (
                  <div>
                    <div className="th-row grid grid-cols-[44px_minmax(0,1fr)_40px] gap-3 border-b-2 border-divider py-2 sm:grid-cols-[44px_minmax(0,1fr)_90px_190px_40px]">
                      <span />
                      <span>File</span>
                      <span className="max-sm:hidden">Size</span>
                      <span className="max-sm:hidden">Type</span>
                      <span />
                    </div>
                    {files.map((f) => (
                      <div
                        key={f.key}
                        className={clsx(
                          "grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-3 border-b border-divider py-3 text-[14px] sm:grid-cols-[44px_minmax(0,1fr)_90px_190px_40px]",
                          f.status === "failed" && "bg-accent-100",
                        )}
                      >
                        <span
                          className={clsx(
                            "py-1 text-center font-mono text-[10px] font-semibold",
                            f.status === "failed" ? "bg-accent text-bg" : "bg-surface",
                          )}
                        >
                          {fileExt(f.name)}
                        </span>
                        <span className="min-w-0">
                          <b className="block truncate">{f.name}</b>
                          {f.status === "failed" && (
                            <span className="text-[12px] font-extrabold text-accent-800">Upload failed · {f.error}</span>
                          )}
                          {f.status === "done" && (
                            <span className="text-[12px] opacity-60">
                              {f.fromOrder ? `Already attached to ${f.fromOrder}` : "Uploaded ✓"}
                            </span>
                          )}
                          {f.status === "uploading" && (
                            <>
                              <span className="text-[12px] opacity-60">Uploading… {f.progress}%</span>
                              <span className="relative mt-1.5 block h-[3px] bg-surface">
                                <span className="absolute inset-y-0 left-0 bg-text" style={{ width: `${f.progress}%` }} />
                              </span>
                            </>
                          )}
                          <span className="mt-1 flex items-center gap-2 text-[12px] sm:hidden">
                            {formatBytes(f.size)}
                          </span>
                        </span>
                        <span className={clsx("max-sm:hidden", f.status === "failed" && "text-accent-800")}>
                          {formatBytes(f.size)}
                        </span>
                        <select
                          aria-label={`Type of ${f.name}`}
                          value={f.type}
                          disabled={Boolean(f.fromOrder)}
                          onChange={(e) => update(f.key, { type: e.target.value as AttachmentType })}
                          className="input col-start-2 max-sm:row-start-2 sm:col-start-auto"
                        >
                          {Object.entries(ATTACHMENT_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setFiles((list) => list.filter((x) => x.key !== f.key))}
                          disabled={f.status === "uploading"}
                          className="col-start-3 row-start-1 cursor-pointer border-0 bg-transparent text-[18px] text-text disabled:opacity-30 sm:col-start-auto sm:row-start-auto"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Nav
                  back={back(2)}
                  next={() => go(4)}
                  nextLabel="Next: review"
                  canNext={step3Ok}
                  hint={
                    step3Ok
                      ? null
                      : !poNumber.trim()
                        ? "Enter your PO number"
                        : uploading
                          ? "Waiting for uploads to finish"
                          : !poFile
                            ? "Add a purchase order file to continue"
                            : ready.length > 10
                              ? "Attach up to 10 files"
                              : null
                  }
                />
              </>
            )}
          </div>
          <Summary rows={summary} />
        </div>
      )}

      {step === 4 && brand && (
        <div className="grid gap-10 px-4 pb-10 pt-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="border border-divider bg-surface">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-divider px-6 py-5">
              <div>
                <h6 className="m-0 text-accent-700">Review</h6>
                <h2 className="mb-0 mt-1 text-[26px] sm:text-[32px]">
                  {qty.toLocaleString("en-US")} × {brand.name} crowns
                </h2>
              </div>
              <span className="text-[13px]">
                PO <b>{poNumber.trim()}</b>
              </span>
            </div>
            <div className="grid sm:grid-cols-3">
              {(
                [
                  ["Brand", brand.name, 1],
                  ["Crown", brand.spec, 1],
                  ["Liner", brand.liner, 1],
                  ["Quantity", `${qty.toLocaleString("en-US")} crowns`, 2],
                  ["Requested delivery", requestedDate ? formatDate(requestedDate) : "No date given", 2],
                  ["Fulfilment", fulfilment === "delivery" ? "Delivery" : "Pickup at Bole Lemi", 2],
                  ...(fulfilment === "delivery" ? ([["Deliver to", address.trim(), 2]] as const) : []),
                ] as [string, string, Step][]
              ).map(([k, v, s]) => (
                <div key={k} className="border-b border-r border-divider px-6 py-4">
                  <div className="text-[11px] uppercase tracking-[0.08em] opacity-60">{k}</div>
                  <div className="mt-1 whitespace-pre-line break-words text-[15px] font-extrabold">{v}</div>
                  <button
                    type="button"
                    onClick={() => go(s)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent underline underline-offset-2"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
            <div className="px-6 py-4">
              <h6 className="mb-1.5 mt-0">Attachments</h6>
              <div className="flex flex-col text-[13px]">
                {ready.map((f) => (
                  <span key={f.key} className="border-b border-divider py-1.5 last:border-b-0">
                    <b>{f.name}</b> · {ATTACHMENT_TYPE_LABELS[f.type]} · {formatBytes(f.size)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 border-t-2 border-text pt-3.5 text-[14px]">
              <h4 className="m-0">What happens next</h4>
              <span>1. Peniel checks your order against the PO and confirms the due date.</span>
              <span>2. Until then it shows as Submitted in your orders.</span>
              <span>3. After that you can follow each stage under Orders.</span>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 border-t border-divider pt-3.5 text-[13px]">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>
                I confirm the brand, quantity and dates match PO <b>{poNumber.trim()}</b>.
              </span>
            </label>
            {error && (
              <p role="alert" className="m-0 bg-accent px-3.5 py-2.5 text-[13px] text-bg">
                {error}
              </p>
            )}
            <Button
              type="button"
              onClick={submit}
              disabled={!confirmed || pending}
              icon="→"
              className="p-4 text-[16px]"
            >
              {pending ? "Submitting…" : "Submit order"}
            </Button>
            <button type="button" className="btn btn-ghost self-start" onClick={() => go(3)}>
              ← Back to attachments
            </button>
          </div>
        </div>
      )}
    </>
  );
}

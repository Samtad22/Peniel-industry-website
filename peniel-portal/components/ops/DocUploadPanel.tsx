"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Eye, Lock } from "lucide-react";
import { createDocument, type DocState } from "@/app/ops/documents/actions";
import { Button, FormMessage } from "@/components/ui/form";
import { DOC_TYPES } from "@/lib/documents";
import FileDrop from "@/components/ui/FileDrop";
import { fileProblem, safeFileName } from "@/lib/files";
import { uploadToStorage } from "@/lib/upload";

export type Pick = { id: string; name: string };

/** "Upload document" panel of the staff Documents page (design 1n). */
export default function DocUploadPanel({
  companies,
  orders,
  brands,
}: {
  companies: Pick[];
  orders: (Pick & { company_id: string })[];
  brands: (Pick & { company_id: string })[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [type, setType] = useState("qc_certificate");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"customer" | "internal">("customer");
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<DocState>(null);
  const [pending, start] = useTransition();

  const company = companies.find((c) => c.id === companyId);
  const order = orders.find((o) => o.id === orderId);
  const ready = file && !fileProblem(file) && companyId && progress === null;

  const upload = () => {
    if (!file || !companyId) return;
    setState(null);
    const path = `${companyId}/documents/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    setProgress(0);
    start(async () => {
      try {
        await uploadToStorage("documents", file, path, setProgress);
      } catch (e) {
        setProgress(null);
        setState({ error: (e as Error).message });
        return;
      }
      const res = await createDocument({ companyId, orderId, brandId, type, title, visibility, path, name: file.name, size: file.size });
      setProgress(null);
      setState(res);
      if (res?.ok) {
        setFile(null);
        setTitle("");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <h4 className="m-0">Upload document</h4>
      <FileDrop id="doc-file" file={file} onFile={setFile} />
      <div className="field">
        <label htmlFor="doc-company">Customer</label>
        <select
          id="doc-company"
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setOrderId("");
            setBrandId("");
          }}
          className="input !bg-bg"
        >
          <option value="">Choose a customer</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="doc-order">Order</label>
          <select id="doc-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} disabled={!companyId} className="input !bg-bg">
            <option value="">None</option>
            {orders
              .filter((o) => o.company_id === companyId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="doc-brand">Brand</label>
          <select id="doc-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={!companyId} className="input !bg-bg">
            <option value="">None</option>
            {brands
              .filter((b) => b.company_id === companyId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="doc-type">Type</label>
        <select id="doc-type" value={type} onChange={(e) => setType(e.target.value)} className="input !bg-bg">
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="doc-title">Title (optional)</label>
        <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={file?.name ?? "e.g. QC certificate B-26-0421"} className="input !bg-bg" />
      </div>
      <fieldset className="field m-0 border-0 p-0">
        <legend className="mb-[5px] p-0 text-[12px] text-text/70">Visibility</legend>
        <div className="grid grid-cols-2 border-2 border-text text-[13px]">
          {(
            [
              ["customer", "Customer-visible", Eye],
              ["internal", "Internal only", Lock],
            ] as const
          ).map(([v, label, Icon], i) => (
            <label
              key={v}
              className={clsx(
                "flex cursor-pointer items-center justify-center gap-1.5 p-2.5 font-extrabold",
                i && "border-l-2 border-text",
                visibility === v ? (v === "customer" ? "bg-accent-100 text-accent-800" : "bg-text text-bg") : "bg-bg",
              )}
            >
              <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
              <Icon size={14} aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="m-0 text-[12px] opacity-75">
        {visibility === "customer"
          ? `${company ? `${company.name} users` : "The customer's users"} will see this in Documents${order ? ` and on order ${order.name.split(" ")[0]}` : ""}.`
          : "Only Peniel staff will see this."}
      </p>
      {progress !== null && (
        <div className="text-[12px]">
          Uploading… {progress}%
          <span className="relative mt-1 block h-[3px] bg-bg">
            <span className="absolute inset-y-0 left-0 bg-text" style={{ width: `${progress}%` }} />
          </span>
        </div>
      )}
      <FormMessage state={state} />
      <Button type="button" onClick={upload} disabled={!ready || pending} icon="↑" className="px-4 py-3">
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}

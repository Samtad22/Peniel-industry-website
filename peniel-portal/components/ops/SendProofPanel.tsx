"use client";

import { useState, useTransition } from "react";
import { sendProof, type ArtworkState } from "@/app/ops/artwork/actions";
import { DeliveryFields, NO_DELIVERY, type DeliveryValue } from "@/components/ops/ArtworkForms";
import { CustomerWarning } from "@/components/ops/OrderForms";
import FileDrop from "@/components/ui/FileDrop";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees } from "@/components/ui/Visibility";
import { fileProblem, safeFileName } from "@/lib/files";
import { uploadToStorage } from "@/lib/upload";

export type ProofBrand = { id: string; name: string; lastRequest: { version: number | null; comment: string; by: string | null; at: string | null } | null };

/** "Send proof" panel of the staff Artwork page (design 1m). */
export default function SendProofPanel({
  companyId,
  brands,
  orders,
  minDate,
}: {
  companyId: string;
  brands: ProofBrand[];
  orders: { id: string; brand_id: string; label: string; status: string }[];
  minDate: string;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [orderId, setOrderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [approveBy, setApproveBy] = useState("");
  const [setAwaiting, setSetAwaiting] = useState(true);
  const [delivery, setDelivery] = useState<DeliveryValue>(NO_DELIVERY);
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<ArtworkState>(null);
  const [pending, start] = useTransition();

  const brand = brands.find((b) => b.id === brandId);
  const order = orders.find((o) => o.id === orderId);

  const canSend = Boolean(brandId) && (file ? !fileProblem(file, "artwork") : Boolean(delivery.method));

  const send = () => {
    if (!canSend) return;
    setState(null);
    const path = file ? `${companyId}/proofs/${crypto.randomUUID()}/${safeFileName(file.name)}` : "";
    start(async () => {
      if (file) {
        setProgress(0);
        try {
          await uploadToStorage("proofs", file, path, setProgress);
        } catch (e) {
          setProgress(null);
          setState({ error: (e as Error).message });
          return;
        }
      }
      const res = await sendProof({
        brandId,
        orderId,
        path,
        name: file?.name ?? "",
        size: file?.size ?? 0,
        note,
        approveBy,
        setAwaiting,
        delivery,
      });
      setProgress(null);
      setState(res);
      if (res?.ok) {
        setFile(null);
        setNote("");
        setDelivery(NO_DELIVERY);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <h3 className="m-0">Send a proof</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="sp-brand">Brand</label>
          <select id="sp-brand" value={brandId} onChange={(e) => { setBrandId(e.target.value); setOrderId(""); }} className="input !bg-bg">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sp-order">Order (optional)</label>
          <select id="sp-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input !bg-bg">
            <option value="">No order</option>
            {orders.filter((o) => o.brand_id === brandId).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      {brand?.lastRequest && (
        <div className="bg-accent-100 px-3 py-2.5 text-[13px] text-accent-800">
          <b>Customer requested changes on {brand.lastRequest.version ? `v${brand.lastRequest.version}` : "the last proof"}:</b>
          <br />“{brand.lastRequest.comment}”{brand.lastRequest.by && ` (${brand.lastRequest.by})`}
        </div>
      )}
      <FileDrop id="proof-file" file={file} onFile={setFile} kind="artwork" />
      {delivery.method && !file && <span className="-mt-2 text-[12px] opacity-70">No file needed for a physical-only proof.</span>}
      <DeliveryFields value={delivery} onChange={setDelivery} idPrefix="sp" />
      <div className="field">
        <label htmlFor="sp-note" className="!flex justify-between gap-2">
          Note to customer
          <CustomerSees />
        </label>
        <textarea id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What changed in this version" className="input !min-h-[70px] !bg-bg" />
      </div>
      <CustomerWarning />
      <div className="field">
        <label htmlFor="sp-by">Approve by (optional)</label>
        <input id="sp-by" type="date" min={minDate} value={approveBy} onChange={(e) => setApproveBy(e.target.value)} className="input !bg-bg" />
      </div>
      {order && ["confirmed", "scheduled"].includes(order.status) && (
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" checked={setAwaiting} onChange={(e) => setSetAwaiting(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
          <span>Set {order.label.split(" ")[0]} to “Awaiting approval” while the customer reviews</span>
        </label>
      )}
      {progress !== null && <div className="text-[12px]">Uploading… {progress}%</div>}
      <FormMessage state={state} />
      <Button type="button" onClick={send} disabled={!canSend || pending} icon="→" className="px-4 py-3">
        {pending ? "Sending…" : "Send proof to customer"}
      </Button>
    </div>
  );
}

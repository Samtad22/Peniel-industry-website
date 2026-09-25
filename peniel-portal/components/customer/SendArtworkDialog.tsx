"use client";

import { useState, useTransition } from "react";
import { submitArtwork, type ProofState } from "@/app/(customer)/artwork/actions";
import FileDrop from "@/components/ui/FileDrop";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { fileProblem, safeFileName } from "@/lib/files";
import { uploadToStorage } from "@/lib/upload";

/** "Send artwork to Peniel": the customer's side of the two-way artwork process. */
export default function SendArtworkDialog({
  companyId,
  brands,
  orders,
}: {
  companyId: string;
  brands: { id: string; name: string }[];
  orders: { id: string; brand_id: string; label: string }[];
}) {
  return (
    <Modal
      title="Send artwork to Peniel"
      wide
      trigger={(open) => (
        <Button type="button" onClick={open}>
          ↑ Send artwork to Peniel
        </Button>
      )}
    >
      {(close) => <SendArtworkForm companyId={companyId} brands={brands} orders={orders} close={close} />}
    </Modal>
  );
}

function SendArtworkForm({
  companyId,
  brands,
  orders,
  close,
}: {
  companyId: string;
  brands: { id: string; name: string }[];
  orders: { id: string; brand_id: string; label: string }[];
  close: () => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [orderId, setOrderId] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<ProofState>(null);
  const [pending, start] = useTransition();

  const send = () => {
    if (!file || fileProblem(file) || !title.trim()) return;
    setState(null);
    setProgress(0);
    const path = `${companyId}/submissions/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    start(async () => {
      try {
        await uploadToStorage("artwork", file, path, setProgress);
      } catch (e) {
        setProgress(null);
        setState({ error: (e as Error).message });
        return;
      }
      const res = await submitArtwork({ title, note, brandId, orderId, path, name: file.name, size: file.size });
      setProgress(null);
      setState(res);
      if (res?.ok) {
        setFile(null);
        setTitle("");
        setNote("");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-[13px] opacity-75">
        New label, a change, or a reference for Peniel to work from. Peniel reviews it and replies here; once it&apos;s agreed, they send you a proof.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sa-brand">Brand</label>
          <select
            id="sa-brand"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setOrderId("");
            }}
            className="input min-h-11"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="">A new brand / not listed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sa-order">For an order (optional)</label>
          <select id="sa-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input min-h-11" disabled={!brandId}>
            <option value="">No particular order</option>
            {orders
              .filter((o) => o.brand_id === brandId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="sa-title">Title</label>
        <input id="sa-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Negus 2027 label, new gold colour" className="input min-h-11" />
      </div>
      <FileDrop id="sa-file" file={file} onFile={setFile} />
      <div className="field">
        <label htmlFor="sa-note">Note for Peniel (optional)</label>
        <textarea id="sa-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What should change, colours (e.g. PMS 485 C), deadlines…" className="input !min-h-[70px]" />
      </div>
      {progress !== null && <div className="text-[12px]">Uploading… {progress}%</div>}
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="button" onClick={send} disabled={!file || !!fileProblem(file) || !title.trim() || pending} icon="→" className="w-[170px]">
          {pending ? "Sending…" : "Send to Peniel"}
        </Button>
      </div>
    </div>
  );
}

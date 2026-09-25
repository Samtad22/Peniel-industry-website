"use client";

import { useState, useTransition } from "react";
import { addOrderFile, type UploadState } from "@/app/(customer)/documents/actions";
import FileDrop from "@/components/ui/FileDrop";
import { Button, FormMessage } from "@/components/ui/form";
import { ATTACHMENT_TYPE_LABELS, fileProblem, safeFileName, type AttachmentType } from "@/lib/files";
import { uploadToStorage } from "@/lib/upload";

/** Customer "Upload document" dialog (design 1n): a file attached to one of your orders. */
export default function UploadDocumentDialog({
  companyId,
  orders,
  label = "↑ Upload document",
  variant = "primary",
}: {
  companyId: string;
  orders: { id: string; label: string }[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<AttachmentType>("purchase_order");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<UploadState>(null);
  const [pending, start] = useTransition();

  const upload = () => {
    if (!file || !orderId) return;
    setState(null);
    setProgress(0);
    const path = `${companyId}/${orderId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
    start(async () => {
      try {
        await uploadToStorage("order-attachments", file, path, setProgress);
      } catch (e) {
        setProgress(null);
        setState({ error: (e as Error).message });
        return;
      }
      const res = await addOrderFile({ orderId, path, name: file.name, size: file.size, type });
      setProgress(null);
      setState(res);
      if (res?.ok) setFile(null);
    });
  };

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)} disabled={orders.length === 0} title={orders.length ? undefined : "Place an order first"}>
        {label}
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
            <div id="upload-title" className="dialog-title">
              Upload document
            </div>
            <FileDrop id="cust-file" file={file} onFile={setFile} />
            <div className="field">
              <label htmlFor="up-type">Document type</label>
              <select id="up-type" value={type} onChange={(e) => setType(e.target.value as AttachmentType)} className="input min-h-11">
                {Object.entries(ATTACHMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="up-order">Attach to order</label>
              <select id="up-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input min-h-11">
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {progress !== null && <div className="text-[12px]">Uploading… {progress}%</div>}
            <FormMessage state={state} />
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {state?.ok ? "Done" : "Cancel"}
              </Button>
              <Button type="button" onClick={upload} disabled={!file || !!fileProblem(file) || !orderId || pending} icon="↑" className="w-[150px]">
                {pending ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

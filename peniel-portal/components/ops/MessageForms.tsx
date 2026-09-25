"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Lock } from "lucide-react";
import { sendStaffMessage, startThread, type MessageState } from "@/app/ops/messages/actions";
import { CustomerWarning } from "@/components/ops/OrderForms";
import { FilePicker, useMessageFiles } from "@/components/ui/FilePicker";
import { Button, FormMessage } from "@/components/ui/form";
import { CustomerSees } from "@/components/ui/Visibility";

/** Reply to the customer or add an internal note (design 1q). */
export function Composer({ threadId, companyId }: { threadId: string; companyId: string }) {
  const [kind, setKind] = useState<"reply" | "internal">("reply");
  const { files, setFiles, progress, attach, clear } = useMessageFiles(companyId);
  const [state, action, pending] = useActionState<MessageState, FormData>(async (prev, fd) => {
    const problem = await attach(fd);
    if (problem) return { error: problem };
    const res = await sendStaffMessage(prev, fd);
    if (res?.ok) clear();
    return res;
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex border-b-2 border-divider text-[13px]" role="tablist">
        {(
          [
            ["reply", "Reply to customer"],
            ["internal", "Internal note"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={clsx(
              "-mb-0.5 flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2 text-[13px]",
              kind === k ? "border-accent font-extrabold text-text" : "border-transparent text-neutral-700",
            )}
          >
            {k === "internal" && <Lock size={12} aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>
      <label htmlFor={`body-${threadId}`} className="sr-only">
        {kind === "reply" ? "Reply to the customer" : "Internal note"}
      </label>
      <textarea
        id={`body-${threadId}`}
        name="body"
        required={!files.length}
        maxLength={4000}
        placeholder={kind === "reply" ? "Write to the customer" : "Only Peniel staff see this"}
        className={clsx("input !min-h-[88px]", kind === "internal" && "!bg-neutral-200")}
      />
      <FilePicker id={`files-${threadId}`} files={files} onChange={setFiles} progress={progress} />
      {kind === "reply" ? <CustomerWarning /> : <span className="text-[12px] opacity-70">Never shown to the customer.</span>}
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3">
        {kind === "reply" ? <CustomerSees /> : <span />}
        <Button type="submit" disabled={pending} icon="→" className="w-[200px]">
          {pending ? "Sending…" : kind === "reply" ? "Send to customer" : "Add note"}
        </Button>
      </div>
    </form>
  );
}

export function NewThreadDialog({
  companies,
  orders,
}: {
  companies: { id: string; name: string }[];
  orders: { id: string; company_id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const { files, setFiles, progress, attach, clear } = useMessageFiles(companyId);
  const [state, action, pending] = useActionState<MessageState, FormData>(async (prev, fd) => {
    const problem = await attach(fd);
    if (problem) return { error: problem };
    try {
      return await startThread(prev, fd);
    } catch (e) {
      clear(); // sent: the action redirects to the new conversation
      throw e;
    }
  }, null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
        + New message
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form action={action} className="dialog !w-[min(520px,100%)]" role="dialog" aria-modal="true" aria-labelledby="new-thread-title">
            <div id="new-thread-title" className="dialog-title">
              Message a customer
            </div>
            <div className="field">
              <label htmlFor="nt-company">Customer</label>
              <select
                id="nt-company"
                name="company_id"
                required
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  clear(); // uploads belong to one customer's folder
                }}
                className="input"
              >
                <option value="">Choose a customer</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nt-order">About an order (optional)</label>
              <select id="nt-order" name="order_id" className="input" disabled={!companyId}>
                <option value="">No particular order</option>
                {orders
                  .filter((o) => o.company_id === companyId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nt-subject">Subject</label>
              <input id="nt-subject" name="subject" required maxLength={150} className="input" />
            </div>
            <div className="field">
              <label htmlFor="nt-body" className="!flex justify-between gap-2">
                Message
                <CustomerSees />
              </label>
              <textarea id="nt-body" name="body" required={!files.length} maxLength={4000} className="input" />
            </div>
            <FilePicker id="nt-files" files={files} onChange={setFiles} progress={progress} />
            <CustomerWarning />
            <FormMessage state={state} />
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

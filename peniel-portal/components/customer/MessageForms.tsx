"use client";

import { useActionState } from "react";
import { sendToPeniel, type CustomerMessageState } from "@/app/(customer)/messages/actions";
import { FilePicker, useMessageFiles } from "@/components/ui/FilePicker";
import { Button, FormMessage } from "@/components/ui/form";

/** Upload the chosen files, then send; the redirect on success clears the form. */
function useSend(companyId: string) {
  const f = useMessageFiles(companyId);
  const [state, action, pending] = useActionState<CustomerMessageState, FormData>(async (prev, fd) => {
    const problem = await f.attach(fd);
    if (problem) return { error: problem };
    try {
      return await sendToPeniel(prev, fd);
    } catch (e) {
      f.clear(); // sent: the action redirects to the conversation
      throw e;
    }
  }, null);
  return { ...f, state, action, pending };
}

export function CustomerReply({ threadId, companyId }: { threadId: string; companyId: string }) {
  const { state, action, pending, files, setFiles, progress } = useSend(companyId);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <label htmlFor="reply" className="sr-only">
        Reply to Peniel
      </label>
      <textarea id="reply" name="body" required={!files.length} maxLength={4000} placeholder="Write to Peniel" className="input !min-h-[88px]" />
      <FilePicker id="reply-files" files={files} onChange={setFiles} progress={progress} />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="w-[160px] self-end">
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

export function NewConversation({
  orders,
  orderId,
  companyId,
}: {
  orders: { id: string; label: string }[];
  orderId?: string;
  companyId: string;
}) {
  const { state, action, pending, files, setFiles, progress } = useSend(companyId);
  return (
    <form action={action} className="flex max-w-[640px] flex-col gap-3.5">
      <div className="field">
        <label htmlFor="nc-order">About an order (optional)</label>
        <select id="nc-order" name="order_id" defaultValue={orderId ?? ""} className="input min-h-11">
          <option value="">No particular order</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="nc-subject">Subject</label>
        <input id="nc-subject" name="subject" required maxLength={150} className="input min-h-11" />
      </div>
      <div className="field">
        <label htmlFor="nc-body">Message</label>
        <textarea id="nc-body" name="body" required={!files.length} maxLength={4000} className="input !min-h-[120px]" />
      </div>
      <FilePicker id="nc-files" files={files} onChange={setFiles} progress={progress} />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="w-[200px]">
        {pending ? "Sending…" : "Send to Peniel"}
      </Button>
    </form>
  );
}

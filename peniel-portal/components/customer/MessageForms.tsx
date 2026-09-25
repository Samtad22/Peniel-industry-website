"use client";

import { useActionState } from "react";
import { sendToPeniel, type CustomerMessageState } from "@/app/(customer)/messages/actions";
import { Button, FormMessage } from "@/components/ui/form";

export function CustomerReply({ threadId }: { threadId: string }) {
  const [state, action, pending] = useActionState<CustomerMessageState, FormData>(sendToPeniel, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <label htmlFor="reply" className="sr-only">
        Reply to Peniel
      </label>
      <textarea id="reply" name="body" required maxLength={4000} placeholder="Write to Peniel" className="input !min-h-[88px]" />
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
}: {
  orders: { id: string; label: string }[];
  orderId?: string;
}) {
  const [state, action, pending] = useActionState<CustomerMessageState, FormData>(sendToPeniel, null);
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
        <textarea id="nc-body" name="body" required maxLength={4000} className="input !min-h-[120px]" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="w-[200px]">
        {pending ? "Sending…" : "Send to Peniel"}
      </Button>
    </form>
  );
}

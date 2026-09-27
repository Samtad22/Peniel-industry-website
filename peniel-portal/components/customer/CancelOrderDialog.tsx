"use client";

import { useActionState } from "react";
import { cancelOrder, type ActionState } from "@/app/(customer)/orders/actions";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";

/** "Cancel this order": only while Peniel hasn't confirmed it. */
export default function CancelOrderDialog({ orderId, orderNo }: { orderId: string; orderNo: string }) {
  return (
    <Modal
      title={`Cancel order ${orderNo}?`}
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} icon="✕" className="min-h-12 text-accent-800">
          Cancel this order
        </Button>
      )}
    >
      {(close) => <CancelForm orderId={orderId} close={close} />}
    </Modal>
  );
}

function CancelForm({ orderId, close }: { orderId: string; close: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelOrder, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="order_id" value={orderId} />
      <p className="m-0 text-[14px]">
        Peniel hasn&apos;t confirmed this order yet, so you can still cancel it. This can&apos;t be undone; you can place the order again later.
      </p>
      <Field label="Reason (optional)" htmlFor="co-reason">
        <textarea id="co-reason" name="reason" maxLength={500} placeholder="e.g. Ordered the wrong brand" className="input !min-h-[64px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Keep the order"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending} icon="✕" className="w-[190px]">
            {pending ? "Cancelling…" : "Cancel the order"}
          </Button>
        )}
      </div>
    </form>
  );
}

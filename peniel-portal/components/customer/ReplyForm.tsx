"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyOnOrder, type ActionState } from "@/app/(customer)/orders/actions";
import { Button, FormMessage } from "@/components/ui/form";

export default function ReplyForm({ threadId }: { threadId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replyOnOrder, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <label htmlFor={`reply-${threadId}`} className="sr-only">
        Reply to Peniel
      </label>
      <textarea
        id={`reply-${threadId}`}
        name="body"
        required
        maxLength={4000}
        className="input !min-h-[72px]"
        placeholder="Reply to Peniel"
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="self-end w-[140px]">
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}

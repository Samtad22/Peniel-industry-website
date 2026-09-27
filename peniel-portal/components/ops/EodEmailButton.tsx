"use client";

import { useActionState } from "react";
import { emailEodReport, type EodState } from "@/app/ops/reports/eod/actions";

/** "Email it now": sends this day's report to the admins. */
export default function EodEmailButton({ date }: { date: string }) {
  const [state, action, pending] = useActionState<EodState, FormData>(emailEodReport, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="date" value={date} />
      <button type="submit" disabled={pending} className="btn btn-secondary btn-split text-text">
        {pending ? "Sending…" : "Email it now"}
        <span aria-hidden="true">✉︎</span>
      </button>
      {state?.ok && <span role="status" className="text-[12px]">{state.ok}</span>}
      {state?.error && <span role="alert" className="text-[12px] font-extrabold text-accent-800">{state.error}</span>}
    </form>
  );
}

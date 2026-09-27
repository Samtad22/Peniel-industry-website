"use client";

import { useActionState } from "react";
import { emailMonthReport, type MonthState } from "@/app/ops/reports/month/actions";

/** "Email it now": sends this month's summary to the admins. */
export default function MonthEmailButton({ month }: { month: string }) {
  const [state, action, pending] = useActionState<MonthState, FormData>(emailMonthReport, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="month" value={month} />
      <button type="submit" disabled={pending} className="btn btn-secondary btn-split text-text">
        {pending ? "Sending…" : "Email it now"}
        <span aria-hidden="true">✉︎</span>
      </button>
      {state?.ok && <span role="status" className="text-[12px]">{state.ok}</span>}
      {state?.error && <span role="alert" className="text-[12px] font-extrabold text-accent-800">{state.error}</span>}
    </form>
  );
}

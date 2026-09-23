"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui/form";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { inviteUser, type InviteState } from "./actions";

export default function InviteForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, null);
  const [role, setRole] = useState<Role>("customer_user");

  return (
    <form action={action} className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
      <Field label="Full name" htmlFor="full_name">
        <input id="full_name" name="full_name" required className={inputClass} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required className={inputClass} />
      </Field>
      <Field label="Role" htmlFor="role">
        <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {r === "customer_user" ? "Customer user" : `Staff — ${ROLE_LABELS[r]}`}
            </option>
          ))}
        </select>
      </Field>
      {role === "customer_user" ? (
        <Field label="Customer company" htmlFor="company_id">
          <select id="company_id" name="company_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose…
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div />
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

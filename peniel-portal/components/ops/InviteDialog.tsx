"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { inviteUser, type InviteState } from "@/app/ops/actions";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/roles";

/**
 * "Invite user" dialog (design 1p). For customers it is fixed to one
 * company; for staff it offers the staff roles.
 */
export default function InviteDialog({
  mode,
  company,
  triggerLabel,
}: {
  mode: "customer" | "staff";
  company?: { id: string; name: string };
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form ref={formRef} action={action} className="dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <div id="invite-title" className="dialog-title">
              {mode === "customer" ? "Invite user" : "Add staff"}
            </div>
            <Field label="Full name" htmlFor="invite-name">
              <input id="invite-name" name="full_name" required className="input min-h-11" autoFocus />
            </Field>
            <Field label="Email" htmlFor="invite-email">
              <input id="invite-email" name="email" type="email" required className="input min-h-11" />
            </Field>
            {mode === "customer" && company ? (
              <>
                <input type="hidden" name="role" value="customer_user" />
                <input type="hidden" name="company_id" value={company.id} />
                <Field label="Company" htmlFor="invite-company">
                  <input id="invite-company" className="input" value={company.name} readOnly />
                </Field>
              </>
            ) : (
              <Field label="Role" htmlFor="invite-role">
                <select id="invite-role" name="role" className="input" defaultValue="sales">
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="border-t border-divider pt-2.5 text-[12px] opacity-75">
              They get an email link to set a password. There is no public sign-up.
            </div>
            <FormMessage state={state} />
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {state?.ok ? "Done" : "Cancel"}
              </Button>
              <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
                {pending ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

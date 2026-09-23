"use client";

import { useActionState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui/form";
import type { AuthState } from "@/app/login/actions";
import { setPassword } from "./actions";

export default function SetPasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(setPassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" htmlFor="password" hint={`At least ${minLength} characters.`}>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={minLength} required className={inputClass} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={minLength} required className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import AuthCard from "@/components/AuthCard";
import { Button, Field, FormMessage } from "@/components/ui/form";
import type { AuthState } from "@/app/login/actions";
import { requestReset } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, null);
  return (
    <AuthCard title="Reset your password" description="We'll email you a link to choose a new password.">
      <form action={action} className="flex flex-col gap-5">
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input min-h-11" />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} icon="→" className="w-full px-4 py-3.5 text-[15px]">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <Link href="/login" className="btn btn-ghost self-start">
          ← Back to log in
        </Link>
      </form>
    </AuthCard>
  );
}

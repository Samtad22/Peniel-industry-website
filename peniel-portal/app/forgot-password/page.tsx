"use client";

import Link from "next/link";
import { useActionState } from "react";
import AuthCard from "@/components/AuthCard";
import { Button, Field, FormMessage, inputClass } from "@/components/ui/form";
import type { AuthState } from "@/app/login/actions";
import { requestReset } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, null);
  return (
    <AuthCard title="Reset your password" description="We'll email you a link to choose a new password.">
      <form action={action} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-navy hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

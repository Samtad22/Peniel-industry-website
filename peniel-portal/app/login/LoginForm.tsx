"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui/form";
import { signIn, type AuthState } from "./actions";

export default function LoginForm({ next, notice }: { next?: string; notice: AuthState }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, notice);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-navy hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

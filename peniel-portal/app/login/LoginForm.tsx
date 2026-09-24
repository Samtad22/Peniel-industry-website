"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { signIn, type AuthState } from "./actions";

export default function LoginForm({ next, notice }: { next?: string; notice: AuthState }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, notice);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className="input min-h-11" />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        aside={
          <Link href="/forgot-password" className="text-[12px]">
            Forgot password?
          </Link>
        }
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input min-h-11"
        />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="w-full px-4 py-3.5 text-[15px]">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <div className="border-t border-divider pt-4 text-[13px] opacity-70">
        New customer? <a href="https://penielindustry.org/contact">Request an account</a> with your first quote.
      </div>
    </form>
  );
}

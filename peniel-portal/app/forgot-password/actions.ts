"use server";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import type { AuthState } from "@/app/login/actions";

export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/auth/set-password`,
  });
  // Same answer whether or not the account exists.
  return { ok: "If that email has a Peniel Portal account, a reset link is on its way." };
}

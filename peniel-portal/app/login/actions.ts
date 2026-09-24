"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Profile } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export type AuthState = { error?: string; ok?: string } | null;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && error.status !== 400) {
      // Not a wrong password: a config or service problem. Log the reason
      // (never the email or password) so it shows in the Vercel logs.
      console.error("Sign-in failed:", { status: error.status, code: error.code, name: error.name, message: error.message });
    }
    return error && error.status !== 400
      ? { error: "Sign-in is unavailable right now. Please try again in a few minutes." }
      : { error: "That email and password don't match an account." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, company_id, full_name, email, role, active")
    .eq("user_id", data.user.id)
    .maybeSingle<Profile>();

  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "This account is not active. Please contact Peniel Industry." };
  }

  const fallback = homeFor(profile);
  const next = safeNext(formData.get("next"), fallback);
  // Don't send a customer to a staff page (or vice versa) just because of ?next=
  const allowed = profile.role === "customer_user" ? !next.startsWith("/ops") : next.startsWith("/ops");
  redirect(allowed ? next : fallback);
}

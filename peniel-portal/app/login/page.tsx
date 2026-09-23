import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { getProfile, homeFor } from "@/lib/auth";
import LoginForm from "./LoginForm";
import type { AuthState } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, AuthState> = {
  link_invalid: { error: "That link has expired or was already used. Ask Peniel for a new invitation, or reset your password." },
  password_set: { ok: "Your password is set. Sign in to continue." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const profile = await getProfile();
  if (profile) redirect(homeFor(profile));

  const { next, notice } = await searchParams;
  return (
    <AuthCard
      title="Sign in"
      description="Accounts are created by Peniel Industry. If you need access, contact your Peniel sales representative."
    >
      <LoginForm next={next} notice={(notice && NOTICES[notice]) || null} />
    </AuthCard>
  );
}

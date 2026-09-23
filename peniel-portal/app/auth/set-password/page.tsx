import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import SetPasswordForm from "./SetPasswordForm";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?notice=link_invalid");

  return (
    <AuthCard title="Choose a password" description={`Signed in as ${data.user.email}.`}>
      <SetPasswordForm minLength={MIN_PASSWORD_LENGTH} />
    </AuthCard>
  );
}

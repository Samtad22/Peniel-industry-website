// Bootstraps the first admin account (there is no public sign-up).
//
//   npm run create-admin -- you@penielindustry.org "Your Name"
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// NEXT_PUBLIC_SITE_URL from .env.local. Sends a normal invite email; the
// admin then chooses a password and invites everyone else from Ops → Users.
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!email || !fullName) {
  console.error('Usage: npm run create-admin -- email@example.com "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.inviteUserByEmail(email.toLowerCase(), {
  redirectTo: `${site}/auth/confirm?next=/auth/set-password`,
  data: { full_name: fullName },
});
if (error) {
  console.error(`Invite failed: ${error.message}`);
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").insert({
  user_id: data.user.id,
  full_name: fullName,
  email: email.toLowerCase(),
  role: "admin",
});
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error(`Could not create the admin profile: ${profileError.message}`);
  process.exit(1);
}

console.log(`Invitation sent to ${email}. Open the email to choose a password.`);

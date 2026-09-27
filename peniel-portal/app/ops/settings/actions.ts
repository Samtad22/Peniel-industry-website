"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { emailConfigured, sendEmails } from "@/lib/email";
import { STAFF_ROLES, type StaffRole } from "@/lib/roles";
import { EMAIL_GROUPS, type EmailGroup } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const s = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

function refresh() {
  // Settings are read across the portal (forms, certificates, emails).
  revalidatePath("/", "layout");
}

async function save(key: "emails_off" | "report_recipients" | "coa" | "plant", value: unknown): Promise<SettingsState> {
  const supabase = await createClient();
  const { error } = await supabase.from("portal_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Only admin changes settings." : "Couldn't save. Please try again." };
  refresh();
  return null;
}

/** Plant defaults: camera reject limit, minutes per oven pass, sheets a stillage starts at. */
export async function savePlant(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireStaff(["admin"]);
  const limit = Number(s(fd, "reject_limit_pct").replace(",", "."));
  const oven = Number(s(fd, "oven_minutes"));
  const sheets = Number(s(fd, "stillage_sheets").replace(/[,\s]/g, ""));
  if (!(limit >= 0.01 && limit <= 20)) return { error: "Camera reject limit: a % from 0.01 to 20." };
  if (!(Number.isInteger(oven) && oven >= 1 && oven <= 240)) return { error: "Oven pass: whole minutes, 1 to 240." };
  if (!(Number.isInteger(sheets) && sheets >= 100 && sheets <= 3000)) return { error: "Sheets per stillage: a whole number, 100 to 3,000." };
  return (await save("plant", { reject_limit_pct: limit, oven_minutes: oven, stillage_sheets: sheets })) ?? { ok: "Saved. Forms and pages use the new values now." };
}

/** What the Certificate of Analysis prints. */
export async function saveCoa(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireStaff(["admin"]);
  const coa = { company: s(fd, "company", 120), documentNo: s(fd, "documentNo", 40), revision: s(fd, "revision", 20), tel: s(fd, "tel", 120), linerTypeId: s(fd, "linerTypeId", 60) };
  if (Object.values(coa).some((v) => !v)) return { error: "Fill in every field." };
  return (await save("coa", coa)) ?? { ok: "Saved. Every certificate now prints these details." };
}

/** Which groups of emails go out, and who gets the reports. */
export async function saveEmails(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireStaff(["admin"]);
  const on = new Set(fd.getAll("on").map(String));
  const off = EMAIL_GROUPS.map((g) => g.key).filter((k) => !on.has(k)) as EmailGroup[];
  const recipients = fd.getAll("report_to").map(String).filter((id) => UUID.test(id));
  const a = await save("emails_off", off);
  if (a) return a;
  const b = await save("report_recipients", recipients);
  if (b) return b;
  return { ok: off.length ? `Saved. ${off.length} group${off.length === 1 ? "" : "s"} of emails turned off.` : "Saved. All emails are on." };
}

/** A test email to yourself, to check email works. */
export async function sendTestEmail(): Promise<SettingsState> {
  const me = await requireStaff(["admin"]);
  if (!emailConfigured()) return { error: "Email isn't set up on this site (RESEND_API_KEY and EMAIL_FROM in Vercel)." };
  if (!me.email) return { error: "Your profile has no email address." };
  await sendEmails(
    [me.email],
    { subject: "Test email from the Peniel portal", heading: "Email works", lines: ["This is a test from Ops → Settings. If you can read it, the portal's emails are reaching your inbox."] },
    { kind: "test" },
  );
  revalidatePath("/ops/settings");
  return { ok: `Sent to ${me.email}. Check the log below and your inbox (and spam folder).` };
}

/** Add a reason staff pick from (hold / delay, or not accepting an order). */
export async function addPreset(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireStaff(["admin"]);
  const kind = s(fd, "kind");
  const text = s(fd, "text", 300);
  if (kind !== "hold" && kind !== "reject") return { error: "Choose the list." };
  if (text.length < 5) return { error: "Write the reason as the customer will read it." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("hold_reason_presets").select("sort_order").eq("kind", kind).order("sort_order", { ascending: false }).limit(1).maybeSingle<{ sort_order: number }>();
  // The same text again: bring it back rather than fail on the duplicate.
  const { error } = await supabase
    .from("hold_reason_presets")
    .upsert({ text, kind, active: true, sort_order: (last?.sort_order ?? 0) + 1 }, { onConflict: "text" });
  if (error) return { error: "Couldn't add it. Please try again." };
  refresh();
  return { ok: "Added." };
}

export async function updatePreset(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireStaff(["admin"]);
  const id = s(fd, "id");
  const text = s(fd, "text", 300);
  if (!UUID.test(id)) return { error: "Not found." };
  if (text.length < 5) return { error: "Write the reason as the customer will read it." };
  const supabase = await createClient();
  const { error } = await supabase.from("hold_reason_presets").update({ text }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That reason is already in a list." : "Couldn't save. Please try again." };
  refresh();
  return { ok: "Saved." };
}

/** Take a reason out of the list (orders that used it keep their text). */
export async function removePreset(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = s(fd, "id");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("hold_reason_presets").update({ active: false }).eq("id", id);
  refresh();
}

/** Move a reason up or down its list. */
export async function movePreset(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = s(fd, "id");
  const dir = s(fd, "dir") === "up" ? -1 : 1;
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: me } = await supabase.from("hold_reason_presets").select("kind").eq("id", id).maybeSingle<{ kind: string }>();
  if (!me) return;
  const { data: list } = await supabase.from("hold_reason_presets").select("id, sort_order").eq("kind", me.kind).eq("active", true).order("sort_order").order("text").returns<{ id: string; sort_order: number }[]>();
  const rows = list ?? [];
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await Promise.all(rows.map((r, k) => (r.sort_order === k + 1 ? null : supabase.from("hold_reason_presets").update({ sort_order: k + 1 }).eq("id", r.id))));
  refresh();
}

/** Change a staff member's role (not your own, so an admin can't lock themselves out). */
export async function setStaffRole(fd: FormData): Promise<void> {
  const me = await requireStaff(["admin"]);
  const userId = s(fd, "user_id");
  const role = s(fd, "role") as StaffRole;
  if (!UUID.test(userId) || userId === me.user_id || !STAFF_ROLES.includes(role)) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ role }).eq("user_id", userId).neq("role", "customer_user");
  revalidatePath("/ops/settings");
}

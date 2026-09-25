"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CustomerState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

/** `HB-001`-style code from the company name when none is given. */
async function nextCode(supabase: Awaited<ReturnType<typeof createClient>>, name: string): Promise<string> {
  const letters =
    name
      .replace(/\b(s\.?c\.?|plc|share company|brewery|breweries|ltd)\b/gi, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "CU";
  const { count } = await supabase.from("companies").select("id", { count: "exact", head: true });
  return `${letters}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/** Add a customer company, or edit one (admin only; RLS enforces the same). */
export async function saveCompany(_prev: CustomerState, fd: FormData): Promise<CustomerState> {
  await requireStaff(["admin"]);
  const id = str(fd, "id", 36);
  const name = str(fd, "name");
  const email = str(fd, "contact_email").toLowerCase();
  if (!name) return { error: "Enter the company name." };
  if (email && !EMAIL.test(email)) return { error: "Check the contact email." };

  const supabase = await createClient();
  const code = (str(fd, "code", 20) || (id ? "" : await nextCode(supabase, name))).toUpperCase();
  const row = {
    name,
    contact_name: str(fd, "contact_name") || null,
    contact_email: email || null,
    contact_phone: str(fd, "contact_phone", 50) || null,
    address: str(fd, "address", 500) || null,
    ...(code ? { code } : {}),
  };

  const { data, error } = UUID.test(id)
    ? await supabase.from("companies").update(row).eq("id", id).select("id").single<{ id: string }>()
    : await supabase.from("companies").insert(row).select("id").single<{ id: string }>();
  if (error || !data) {
    if (error?.code === "23505") return { error: `The customer ID ${code} is already used. Choose another.` };
    if (error?.code === "42501") return { error: "Only admins can add or edit customers." };
    return { error: "Couldn't save the customer. Please try again." };
  }
  revalidatePath("/ops/customers");
  if (!UUID.test(id)) redirect(`/ops/customers?c=${data.id}`);
  return { ok: "Saved." };
}

/** Add a brand to a customer, or edit one (admin and sales). */
export async function saveBrand(_prev: CustomerState, fd: FormData): Promise<CustomerState> {
  await requireStaff(["admin", "sales"]);
  const id = str(fd, "id", 36);
  const companyId = str(fd, "company_id", 36);
  const name = str(fd, "name", 100);
  const liner = str(fd, "liner", 20);
  if (!UUID.test(companyId)) return { error: "Choose the customer." };
  if (!name) return { error: "Enter the brand name." };
  if (liner !== "PVC-free" && liner !== "PVC") return { error: "Choose the liner." };

  const colours = str(fd, "colours", 300)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 8);
  const row = {
    company_id: companyId,
    name,
    size: str(fd, "size", 20) || "26mm",
    liner,
    finish: str(fd, "finish", 50) || null,
    colours,
  };

  const supabase = await createClient();
  const { error } = UUID.test(id)
    ? await supabase.from("brands").update(row).eq("id", id).eq("company_id", companyId)
    : await supabase.from("brands").insert(row);
  if (error) {
    if (error.code === "23505") return { error: `${name} already exists for this customer.` };
    if (error.code === "42501") return { error: "Your role can't change brands." };
    return { error: "Couldn't save the brand. Please try again." };
  }
  revalidatePath("/ops/customers");
  return { ok: UUID.test(id) ? "Brand updated." : `${name} added. Customers can now order it.` };
}

/** Retire a brand: it disappears from new orders; past orders keep it. */
export async function retireBrand(fd: FormData): Promise<void> {
  await requireStaff(["admin", "sales"]);
  const id = str(fd, "id", 36);
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("brands").update({ active: false }).eq("id", id);
  revalidatePath("/ops/customers");
}

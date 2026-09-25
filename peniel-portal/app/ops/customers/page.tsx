import CustomersView, { type CompanyDetail, type CompanyListItem } from "@/components/ops/CustomersView";
import type { UserRow } from "@/components/ops/UsersTable";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES } from "@/lib/order-status";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Customers" };

type CompanyRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};
type BrandRow = {
  id: string;
  company_id: string;
  name: string;
  size: string;
  liner: string;
  finish: string | null;
  colours: string[];
  crown_image_path: string | null;
  current: { version: number } | null;
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const me = await requireStaff(opsRolesFor("customers"));
  const { c } = await searchParams;
  const supabase = await createClient();

  const [{ data: companies }, { data: brands }, { data: people }, { data: orders }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, code, address, contact_name, contact_email, contact_phone, created_at")
      .eq("active", true)
      .order("name")
      .returns<CompanyRow[]>(),
    supabase
      .from("brands")
      .select("id, company_id, name, size, liner, finish, colours, crown_image_path, current:artwork_versions!brands_current_artwork_fk(version)")
      .eq("active", true)
      .order("name")
      .returns<BrandRow[]>(),
    supabase
      .from("profiles")
      .select("user_id, company_id, full_name, email, role, active, last_login_at")
      .eq("role", "customer_user")
      .order("full_name")
      .returns<(UserRow & { company_id: string })[]>(),
    supabase.from("orders").select("company_id").in("status", OPEN_STATUSES).returns<{ company_id: string }[]>(),
  ]);

  const count = <T extends { company_id: string }>(rows: T[] | null, id: string) =>
    (rows ?? []).filter((r) => r.company_id === id).length;

  const list: CompanyListItem[] = (companies ?? []).map((co) => ({
    id: co.id,
    name: co.name,
    brands: count(brands, co.id),
    users: count(people, co.id),
    openOrders: count(orders, co.id),
  }));

  const pick = (companies ?? []).find((co) => co.id === c) ?? companies?.[0];
  const selected: CompanyDetail | null = pick
    ? {
        id: pick.id,
        name: pick.name,
        code: pick.code,
        since: String(new Date(pick.created_at).getFullYear()),
        address: pick.address,
        email: pick.contact_email,
        openOrders: count(orders, pick.id),
        brands: (brands ?? [])
          .filter((b) => b.company_id === pick.id)
          .map((b) => ({
            id: b.id,
            name: b.name,
            spec: [b.size, b.finish, b.liner].filter(Boolean).join(" · "),
            artwork: b.current ? `v${b.current.version} approved` : "No approved artwork",
            fields: {
              id: b.id,
              name: b.name,
              size: b.size,
              liner: b.liner,
              finish: b.finish,
              colours: b.colours,
              crown_image_path: b.crown_image_path,
              artwork: b.current ? `v${b.current.version} approved` : "No approved artwork",
            },
          })),
        users: (people ?? []).filter((p) => p.company_id === pick.id),
        fields: {
          id: pick.id,
          name: pick.name,
          code: pick.code,
          contact_name: pick.contact_name,
          contact_email: pick.contact_email,
          contact_phone: pick.contact_phone,
          address: pick.address,
        },
      }
    : null;

  return (
    <CustomersView
      companies={list}
      selected={selected}
      canInvite={me.role === "admin"}
      canEditBrands={me.role === "admin" || me.role === "sales"}
      meId={me.user_id}
    />
  );
}

import DashboardView, { type DashboardData, type DashOrder } from "@/components/ops/DashboardView";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addisDateISO, formatNowLine, greeting } from "@/lib/format";
import { OPEN_STATUSES, type OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Dashboard" };

type OrderRow = {
  id: string;
  order_no: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  confirmed_due_date: string | null;
  revised_due_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
  created_at: string;
  companies: { name: string } | null;
  brands: { name: string } | null;
};

type ProofRow = {
  id: string;
  created_at: string;
  brands: { name: string; companies: { name: string } | null } | null;
  orders: { order_no: string } | null;
};

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string; role: string } | null;
  message_threads: { assigned_to: string | null; companies: { name: string } | null } | null;
};

export default async function OpsDashboard() {
  const profile = await requireStaff();
  // Production's home is "Production — today" (design 1b).
  if (profile.role === "production") redirect("/ops/production");
  const supabase = await createClient();
  const now = new Date();
  const today = addisDateISO(now);
  const in7 = addisDateISO(now, 7);

  const [{ data: orders }, { data: proofs }, { data: messages }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, po_number, quantity, requested_date, confirmed_due_date, revised_due_date, status, customer_reason, created_at, companies(name), brands(name)",
      )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<OrderRow[]>(),
    supabase
      .from("proofs")
      .select("id, created_at, brands(name, companies(name)), orders(order_no)")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .returns<ProofRow[]>(),
    supabase
      .from("messages")
      .select("id, body, created_at, profiles(full_name, role), message_threads(assigned_to, companies(name))")
      .eq("read_by_staff", false)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<MessageRow[]>(),
  ]);

  const all: DashOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    order_no: o.order_no,
    company: o.companies?.name ?? "-",
    brand: o.brands?.name ?? "-",
    po_number: o.po_number,
    quantity: Number(o.quantity),
    requested_date: o.requested_date,
    due_date: o.revised_due_date ?? o.confirmed_due_date,
    status: o.status,
    customer_reason: o.customer_reason,
    created_at: o.created_at,
  }));

  // Only messages written by customers count as unread for staff.
  const unread = (messages ?? []).filter((m) => m.profiles?.role === "customer_user");

  const data: DashboardData = {
    greeting: greeting(now),
    firstName: profile.full_name.split(" ")[0],
    nowLine: formatNowLine(now),
    now: now.toISOString(),
    inbox: all.filter((o) => o.status === "submitted"),
    due7: all
      .filter((o) => o.status !== "dispatched" && o.due_date && o.due_date >= today && o.due_date <= in7)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)),
    onHold: all.filter((o) => o.status === "on_hold"),
    proofs: (proofs ?? []).map((p) => ({
      id: p.id,
      brand: p.brands?.name ?? "-",
      company: p.brands?.companies?.name ?? "-",
      order_no: p.orders?.order_no ?? null,
      sent_at: p.created_at,
    })),
    unread: unread.map((m) => ({
      id: m.id,
      author: m.profiles?.full_name ?? "Customer",
      company: m.message_threads?.companies?.name ?? "-",
      body: m.body,
      created_at: m.created_at,
    })),
    unreadAssignedToMe: unread.filter((m) => m.message_threads?.assigned_to === profile.user_id).length,
  };

  return <DashboardView d={data} />;
}

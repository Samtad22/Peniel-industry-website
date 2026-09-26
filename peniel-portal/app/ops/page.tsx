import DashboardView, { type DashboardData } from "@/components/ops/DashboardView";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addisDateISO, formatDayMonth, formatQty, greeting, timeAgo } from "@/lib/format";
import { OPEN_STATUSES, type OrderStatus } from "@/lib/order-status";
import { OPS_NAV, type OpsArea } from "@/lib/roles";

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
  created_at: string;
  company_id: string;
  companies: { name: string } | null;
  brands: { name: string } | null;
};
type ProofRow = { id: string; created_at: string; approve_by: string | null; brands: { name: string; companies: { name: string } | null } | null };
type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  thread_id: string;
  profiles: { full_name: string; role: string } | null;
  message_threads: { assigned_to: string | null; companies: { name: string } | null } | null;
};
type PickupRow = { id: string; status: string; requested_at: string; proposed_time: string | null; vehicle: string | null; companies: { name: string } | null };
type HeldRow = { id: string; batch_no: string; inspected_at: string; orders: { order_no: string; brands: { name: string } | null } | null };
type StockRow = { company_id: string; quantity: number };

const shortCompany = (name: string | undefined | null) => (name ?? "-").replace(/\s+(S\.C\.|PLC|Ethiopia)$/i, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Africa/Addis_Ababa" });
const helloFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" });

/** Peniel Ops home (v2 "Sales home", design 2a). Production's home is the control room. */
export default async function OpsDashboard() {
  const me = await requireStaff();
  if (me.role === "production") redirect("/ops/production");
  const can = (area: OpsArea) => OPS_NAV.some((n) => n.area === area && n.roles.includes(me.role));
  const supabase = await createClient();
  const now = new Date();
  const today = addisDateISO(now);
  const in7 = addisDateISO(now, 6);

  const [{ data: orderData }, { data: proofData }, { data: msgData }, { data: pickupData }, { data: heldData }, { data: stockData }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_no, po_number, quantity, requested_date, confirmed_due_date, revised_due_date, status, created_at, company_id, companies(name), brands(name)",
      )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<OrderRow[]>(),
    supabase.from("proofs").select("id, created_at, approve_by, brands(name, companies(name))").eq("status", "sent").order("created_at").returns<ProofRow[]>(),
    supabase
      .from("messages")
      .select("id, body, created_at, thread_id, profiles(full_name, role), message_threads(assigned_to, companies(name))")
      .eq("read_by_staff", false)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<MessageRow[]>(),
    supabase
      .from("pickup_bookings")
      .select("id, status, requested_at, proposed_time, vehicle, companies(name)")
      .in("status", ["requested", "confirmed", "rescheduled"])
      .order("requested_at")
      .returns<PickupRow[]>(),
    supabase
      .from("qc_inspections")
      .select("id, batch_no, inspected_at, orders(order_no, brands(name))")
      .eq("result", "on_hold")
      .order("inspected_at")
      .returns<HeldRow[]>(),
    supabase.from("finished_stock").select("company_id, quantity").is("collected_at", null).returns<StockRow[]>(),
  ]);

  const orders = orderData ?? [];
  const due = (o: OrderRow) => o.revised_due_date ?? o.confirmed_due_date;
  const inbox = orders.filter((o) => o.status === "submitted").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const onHold = orders.filter((o) => o.status === "on_hold");
  const due7 = orders.filter((o) => o.status !== "dispatched" && due(o) && due(o)! >= today && due(o)! <= in7);
  const proofs = proofData ?? [];
  const overdue = proofs.filter((p) => p.approve_by && p.approve_by < today);
  // Unread = written by customers; one queue line per conversation.
  const unread = (msgData ?? []).filter((m) => m.profiles?.role === "customer_user");
  const unreadThreads = [...new Map(unread.map((m) => [m.thread_id, m])).values()];
  const mine = unread.filter((m) => m.message_threads?.assigned_to === me.user_id).length;
  const pickups = pickupData ?? [];
  const pickupDay = (p: PickupRow) => (p.proposed_time ? addisDateISO(new Date(p.proposed_time)) : null);
  const held = heldData ?? [];

  // The queue: what needs doing, most urgent first, only from areas this role can open.
  const queue: DashboardData["queue"] = [];
  if (can("inbox"))
    for (const o of inbox)
      queue.push({
        kind: "confirm",
        title: `${shortCompany(o.companies?.name)} · ${o.brands?.name ?? "-"} · ${formatQty(o.quantity)}`,
        meta: `PO ${o.po_number} · submitted ${timeAgo(o.created_at, now)}`,
        cta: "Review PO",
        href: `/ops/inbox?o=${o.id}`,
      });
  if (can("quality"))
    for (const b of held)
      queue.push({
        kind: "held",
        title: `Batch ${b.batch_no} · ${b.orders?.brands?.name ?? "-"} · ${b.orders?.order_no ?? ""}`,
        meta: `Held since ${formatDayMonth(b.inspected_at)} · release or keep sorting`,
        cta: "Decide",
        href: `/ops/quality/${b.id}`,
      });
  if (can("artwork"))
    for (const p of overdue)
      queue.push({
        kind: "proof",
        title: `${shortCompany(p.brands?.companies?.name)} · ${p.brands?.name ?? "-"} proof`,
        meta: `Sent ${formatDayMonth(p.created_at)} · approve by ${formatDayMonth(p.approve_by)}`,
        cta: "Chase",
        href: "/ops/artwork",
      });
  if (can("inventory"))
    for (const p of pickups.filter((x) => x.status === "requested" || pickupDay(x) === today))
      queue.push({
        kind: "pickup",
        title: `${shortCompany(p.companies?.name)} · ${p.status === "requested" ? "pickup requested" : "pickup today"}`,
        meta: p.proposed_time ? `${formatDayMonth(p.proposed_time)}${p.vehicle ? ` · truck ${p.vehicle}` : ""}` : `Requested ${timeAgo(p.requested_at, now)}`,
        cta: p.status === "requested" ? "Confirm" : "View",
        href: "/ops/inventory/pickups",
      });
  if (can("messages"))
    for (const m of unreadThreads)
      queue.push({
        kind: "message",
        title: `${m.profiles?.full_name ?? "Customer"} · ${shortCompany(m.message_threads?.companies?.name)}`,
        meta: `"${m.body.length > 70 ? `${m.body.slice(0, 70)}…` : m.body}" · ${timeAgo(m.created_at, now)}`,
        cta: "Reply",
        href: `/ops/messages?t=${m.thread_id}`,
      });

  const first = me.full_name.split(" ")[0];
  const headline =
    can("inbox") && inbox.length
      ? `${plural(inbox.length, "new order is", "new orders are")} waiting for you to confirm.`
      : can("quality") && held.length
        ? `${plural(held.length, "batch is", "batches are")} held and need a decision.`
        : can("inventory") && pickups.some((p) => p.status === "requested")
          ? `${plural(pickups.filter((p) => p.status === "requested").length, "pickup is", "pickups are")} waiting to be confirmed.`
          : queue.length
            ? `${plural(queue.length, "thing needs", "things need")} your attention today.`
            : "Nothing is waiting for you right now.";
  const actions: DashboardData["actions"] = [];
  if (can("inbox") && inbox.length) actions.push({ label: "Open order inbox", href: "/ops/inbox" });
  if (can("quality") && held.length) actions.push({ label: "Open held batches", href: "/ops/quality?f=held" });
  if (can("inventory") && pickups.length) actions.push({ label: "Pickups", href: "/ops/inventory/pickups" });
  if (can("artwork") && overdue.length) actions.push({ label: `${plural(overdue.length, "proof needs", "proofs need")} chasing`, href: "/ops/artwork" });
  if (!actions.length) actions.push({ label: "All orders", href: "/ops/orders" });

  const oldest = inbox[0];
  const dueQty = due7.reduce((s, o) => s + Number(o.quantity), 0);
  const kpis: DashboardData["kpis"] = [
    { label: "New orders", n: inbox.length, sub: oldest ? `oldest ${timeAgo(oldest.created_at, now)}` : "all confirmed", href: "/ops/inbox", warn: inbox.length > 0 },
    { label: "Proofs out", n: proofs.length, sub: overdue.length ? `${overdue.length} overdue` : "none overdue", href: "/ops/artwork", warn: overdue.length > 0 },
    { label: "Due in 7 days", n: due7.length, sub: due7.length ? `${formatQty(dueQty)} crowns` : "nothing due", href: "/ops/orders?due=7" },
    {
      label: "On hold",
      n: onHold.length,
      sub: onHold.length ? [...new Set(onHold.map((o) => shortCompany(o.companies?.name)))].join(", ") : "none",
      href: "/ops/orders?status=on_hold",
    },
    { label: "Unread", n: unread.length, sub: `${mine} assigned to you`, href: "/ops/messages" },
  ];

  const week: DashboardData["week"] = Array.from({ length: 7 }, (_, i) => {
    const date = addisDateISO(now, i);
    const chips: DashboardData["week"][number]["chips"] = [
      ...pickups
        .filter((p) => pickupDay(p) === date)
        .map((p) => ({ label: `${shortCompany(p.companies?.name).split(" ")[0]} pickup`, href: "/ops/inventory/pickups", kind: "pickup" as const })),
      ...orders
        .filter((o) => due(o) === date && o.status !== "dispatched")
        .map((o) => ({ label: `${o.order_no.slice(-4)} ${o.brands?.name ?? ""}`, href: `/ops/orders/${o.id}`, kind: o.status === "on_hold" ? ("hold" as const) : ("due" as const) })),
    ];
    return { day: dayFmt.format(new Date(`${date}T12:00:00+03:00`)).toUpperCase(), date, today: i === 0, chips };
  });

  const stock = new Map<string, number>();
  for (const s of stockData ?? []) stock.set(s.company_id, (stock.get(s.company_id) ?? 0) + Number(s.quantity));
  const byCompany = new Map<string, { name: string; open: number; hold: number }>();
  for (const o of orders.filter((x) => x.status !== "submitted")) {
    const c = byCompany.get(o.company_id) ?? { name: o.companies?.name ?? "-", open: 0, hold: 0 };
    if (o.status === "on_hold") c.hold += Number(o.quantity);
    else c.open += Number(o.quantity);
    byCompany.set(o.company_id, c);
  }
  const volume = [...byCompany.entries()]
    .map(([id, c]) => {
      const inStock = Math.min(stock.get(id) ?? 0, c.open);
      return { name: c.name, total: c.open + c.hold, stock: inStock, open: c.open - inStock, hold: c.hold };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const data: DashboardData = {
    hello: `${greeting(now).toUpperCase()}, ${first.toUpperCase()} · ${helloFmt.format(now).replace("Sept", "Sep").toUpperCase()}`,
    headline,
    actions: actions.slice(0, 2),
    kpis,
    queue: queue.slice(0, 12),
    week,
    weekSummary: `${due7.length} due · ${formatQty(dueQty)} crowns`,
    volume,
  };

  return <DashboardView d={data} />;
}

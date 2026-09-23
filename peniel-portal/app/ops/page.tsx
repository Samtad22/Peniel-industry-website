import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Overview" };

export default async function OpsOverview() {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data: orders } = await supabase.from("orders").select("status").returns<{ status: OrderStatus }[]>();

  const counts = new Map<OrderStatus, number>();
  for (const o of orders ?? []) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  const statuses = (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).filter((s) => counts.has(s));

  return (
    <>
      <PageHeader title={`Hello, ${profile.full_name.split(" ")[0]}`} description="Orders across all customers." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statuses.map((s) => (
          <div key={s} className="rounded-xl border border-line bg-white p-4">
            <StatusBadge status={s} />
            <p className="mt-3 font-display text-3xl font-semibold text-ink">{counts.get(s)}</p>
          </div>
        ))}
        {!statuses.length && <p className="text-sm text-muted">No orders yet.</p>}
      </div>
      {profile.role === "admin" && (
        <p className="mt-8 text-sm text-muted">
          Invite customers and staff from{" "}
          <Link href="/ops/users" className="text-navy hover:underline">
            Users
          </Link>
          .
        </p>
      )}
    </>
  );
}

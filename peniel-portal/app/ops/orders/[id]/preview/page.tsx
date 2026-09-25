import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OrderDetail from "@/components/customer/OrderDetail";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { loadCustomerOrderPreview } from "@/lib/customer-orders";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview as customer" };

/**
 * The order exactly as its customer sees it (design "Preview as customer ↗"),
 * read-only. Built only from customer-facing fields: no internal notes,
 * internal messages, lines, locations or measurements.
 */
export default async function CustomerPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff(opsRolesFor("orders"));
  const { id } = await params;
  const supabase = await createClient();
  const o = await loadCustomerOrderPreview(supabase, id);
  if (!o) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-accent-800 px-4 py-2.5 text-[13px] text-bg sm:px-8">
        <b>Preview as customer</b>
        <span className="w-full opacity-80 sm:w-auto sm:flex-1">This is what the customer sees for this order. Buttons are turned off.</span>
        <Link href={`/ops/orders/${o.id}`} className="font-semibold text-bg underline hover:text-bg">
          ← Back to the order
        </Link>
      </div>
      <div className="flex items-center gap-1.5 border-b-2 border-divider px-4 py-3 sm:px-8">
        <b className="flex-1">{o.order_no}</b>
        <StatusBadge status={o.status} audience="customer" />
      </div>
      <div className="mx-auto max-w-[640px] px-5 pb-10 pt-5">
        <OrderDetail o={o} variant="page" preview />
      </div>
    </>
  );
}

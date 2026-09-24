import { type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { csvLine } from "@/lib/csv";
import { addisDateISO } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { opsRolesFor } from "@/lib/roles";
import { listStaffOrders, parseOrderFilters } from "@/lib/staff-orders";
import { createClient } from "@/lib/supabase/server";

/** The All orders list, with the same filters, as a CSV download (staff only). */
export async function GET(request: NextRequest) {
  await requireStaff(opsRolesFor("orders"));
  const f = parseOrderFilters(Object.fromEntries(request.nextUrl.searchParams));
  const today = addisDateISO(new Date());
  const rows = await listStaffOrders(await createClient(), f, today);

  const body = [
    csvLine(["Order", "Customer", "Brand", "PO", "Product", "Quantity", "Requested", "Due", "Status", "Lines"]),
    ...rows.map((o) =>
      csvLine([
        o.order_no,
        o.company,
        o.brand,
        o.po_number,
        o.product,
        o.quantity,
        o.requested_date,
        o.due_date,
        ORDER_STATUS_LABELS[o.status],
        o.lines.join(" "),
      ]),
    ),
  ].join("\r\n");

  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="peniel-orders-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

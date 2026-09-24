import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Orders" };

export default async function Page() {
  await requireStaff(opsRolesFor("orders"));
  return (
    <OpsPlanned title="Orders" phase={2}>
      {"Every order across customers, with filters, and an order page for status changes, customer-facing reasons, internal notes and the activity log."}
    </OpsPlanned>
  );
}

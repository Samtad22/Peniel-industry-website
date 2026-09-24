import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Order inbox" };

export default async function Page() {
  await requireStaff(opsRolesFor("inbox"));
  return (
    <OpsPlanned title="Order inbox" phase={2} link={{ href: "/ops", label: "Back to dashboard" }}>
      {"New orders with the customer's PO shown alongside, checked against the order. Confirm, ask for clarification, or reject with a reason the customer sees."}
    </OpsPlanned>
  );
}

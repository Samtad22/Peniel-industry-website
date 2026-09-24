import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Quality control" };

export default async function Page() {
  await requireStaff(opsRolesFor("quality"));
  return (
    <OpsPlanned title="Quality control" phase={3}>
      {"Batch inspections, defects by type, release or hold with a customer-facing reason, and what gets published to each customer."}
    </OpsPlanned>
  );
}

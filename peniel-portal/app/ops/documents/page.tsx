import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Documents" };

export default async function Page() {
  await requireStaff(opsRolesFor("documents"));
  return (
    <OpsPlanned title="Documents" phase={4}>
      {"Upload documents against a customer, order and brand, and choose whether the customer can see them."}
    </OpsPlanned>
  );
}

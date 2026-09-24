import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Messages" };

export default async function Page() {
  await requireStaff(opsRolesFor("messages"));
  return (
    <OpsPlanned title="Messages" phase={4}>
      {"Message threads per customer and order, with assignment, replies to customers and internal notes."}
    </OpsPlanned>
  );
}

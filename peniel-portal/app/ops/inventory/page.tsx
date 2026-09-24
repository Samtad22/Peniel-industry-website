import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Inventory" };

export default async function Page() {
  await requireStaff(opsRolesFor("inventory"));
  return (
    <OpsPlanned title="Inventory" phase={4}>
      {"Raw materials, finished goods by customer and brand, pickup bookings and dispatch records."}
    </OpsPlanned>
  );
}

import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Inventory" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/inventory"));
  return (
    <ComingSoon title="Inventory" phase={4}>
      Finished stock, pickup bookings and dispatch.
    </ComingSoon>
  );
}

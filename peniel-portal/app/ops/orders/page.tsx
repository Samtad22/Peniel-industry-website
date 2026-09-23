import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Orders" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/orders"));
  return (
    <ComingSoon title="Orders" phase={2}>
      Order inbox with PO preview, confirm / clarify / reject, status control and audit log.
    </ComingSoon>
  );
}

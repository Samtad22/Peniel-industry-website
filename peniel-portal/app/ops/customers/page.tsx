import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Customers" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/customers"));
  return (
    <ComingSoon title="Customers" phase={2}>
      Companies, brands and crown specifications.
    </ComingSoon>
  );
}

import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Production" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/production"));
  return (
    <ComingSoon title="Production" phase={3}>
      Tablet-friendly production entry and the internal production dashboard.
    </ComingSoon>
  );
}

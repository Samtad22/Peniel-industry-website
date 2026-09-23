import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Quality" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/quality"));
  return (
    <ComingSoon title="Quality" phase={3}>
      QC inspections, release / hold and publish controls.
    </ComingSoon>
  );
}

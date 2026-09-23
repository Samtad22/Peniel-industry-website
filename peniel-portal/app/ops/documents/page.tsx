import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Documents" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/documents"));
  return (
    <ComingSoon title="Documents" phase={4}>
      Document library with customer / internal visibility.
    </ComingSoon>
  );
}

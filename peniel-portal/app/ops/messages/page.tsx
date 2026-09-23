import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Messages" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/messages"));
  return (
    <ComingSoon title="Messages" phase={4}>
      Customer message threads.
    </ComingSoon>
  );
}

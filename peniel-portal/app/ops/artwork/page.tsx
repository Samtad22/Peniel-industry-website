import ComingSoon from "@/components/ui/ComingSoon";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Artwork" };

export default async function Page() {
  await requireStaff(opsRolesFor("/ops/artwork"));
  return (
    <ComingSoon title="Artwork" phase={4}>
      Proof queue and approved artwork.
    </ComingSoon>
  );
}

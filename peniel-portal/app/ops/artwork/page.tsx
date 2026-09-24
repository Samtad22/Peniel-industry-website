import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Artwork" };

export default async function Page() {
  await requireStaff(opsRolesFor("artwork"));
  return (
    <OpsPlanned title="Artwork" phase={4}>
      {"Approved artwork per brand, the proof queue across customers, and sending proofs for approval."}
    </OpsPlanned>
  );
}

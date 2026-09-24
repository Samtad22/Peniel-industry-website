import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Production" };

export default async function Page() {
  await requireStaff(opsRolesFor("production"));
  return (
    <OpsPlanned title="Production" phase={3}>
      {"Tablet-friendly daily entry by shift and line, the live production dashboard, and per-order output with the publish-to-customer switch."}
    </OpsPlanned>
  );
}

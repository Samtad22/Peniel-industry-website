import OpsPlanned from "@/components/ops/OpsPlanned";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Maintenance" };

export default async function Page() {
  await requireStaff(opsRolesFor("maintenance"));
  return (
    <OpsPlanned title="Maintenance" link={{ href: "/ops/production", label: "Go to daily entry" }}>
      {"Planned maintenance, die changes and breakdown logs per line. Log downtime reasons in the daily production entry for now."}
    </OpsPlanned>
  );
}

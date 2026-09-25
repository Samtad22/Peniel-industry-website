import CustomerShell from "@/components/customer/CustomerShell";
import { requireCustomer } from "@/lib/auth";
import { countedAt, customerBadges } from "@/lib/nav-badges";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireCustomer();
  const supabase = await createClient();
  const [{ data: company }, badges] = await Promise.all([
    supabase.from("customer_company").select("name").maybeSingle(),
    customerBadges(supabase, profile),
  ]);

  return (
    <CustomerShell userName={profile.full_name} companyName={company?.name ?? "Customer portal"} badges={badges} badgesAsOf={countedAt()}>
      {children}
    </CustomerShell>
  );
}

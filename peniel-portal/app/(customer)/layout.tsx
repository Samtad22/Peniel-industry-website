import CustomerShell from "@/components/customer/CustomerShell";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireCustomer();
  const supabase = await createClient();
  const { data: company } = await supabase.from("customer_company").select("name").maybeSingle();

  return (
    <CustomerShell userName={profile.full_name} companyName={company?.name ?? "Customer portal"}>
      {children}
    </CustomerShell>
  );
}

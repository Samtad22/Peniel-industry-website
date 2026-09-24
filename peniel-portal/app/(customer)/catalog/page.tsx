import CustomerPlanned from "@/components/customer/CustomerPlanned";

export const metadata = { title: "Crown cork catalog" };

export default function Page() {
  return (
    <CustomerPlanned section="Catalog" title="Crown cork catalog" phase={2}>
      {"Your brands and their crown specifications, and ordering straight from the catalog."}
    </CustomerPlanned>
  );
}

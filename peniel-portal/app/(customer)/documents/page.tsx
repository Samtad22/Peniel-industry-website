import CustomerPlanned from "@/components/customer/CustomerPlanned";

export const metadata = { title: "Documents" };

export default function Page() {
  return (
    <CustomerPlanned section="Documents" title="Documents" phase={4}>
      {"Pro forma invoices, delivery notes, QC certificates and your own POs and specifications, in one place."}
    </CustomerPlanned>
  );
}

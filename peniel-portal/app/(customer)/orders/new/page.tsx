import CustomerPlanned from "@/components/customer/CustomerPlanned";

export const metadata = { title: "New order" };

export default function Page() {
  return (
    <CustomerPlanned section="Orders" title="New order" phase={2}>
      {"Place an order in four steps: product, specs and quantity, your PO and attachments, then review and submit."}
    </CustomerPlanned>
  );
}

import CustomerPlanned from "@/components/customer/CustomerPlanned";

export const metadata = { title: "Your orders in production" };

export default function Page() {
  return (
    <CustomerPlanned section="Production" title="Your orders in production" phase={3}>
      {"Daily output, completed against ordered, reject rates, defects by type and your finished stock at Peniel — updated by Peniel as your orders run."}
    </CustomerPlanned>
  );
}

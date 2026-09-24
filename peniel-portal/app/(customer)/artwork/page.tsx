import CustomerPlanned from "@/components/customer/CustomerPlanned";

export const metadata = { title: "Your artwork" };

export default function Page() {
  return (
    <CustomerPlanned section="Artwork" title="Your artwork" phase={4}>
      {"Proofs waiting for your approval, approved artwork for each brand, and the proof history."}
    </CustomerPlanned>
  );
}

import ComingSoon from "@/components/ui/ComingSoon";

export const metadata = { title: "Production" };

export default function Page() {
  return (
    <ComingSoon title="Production" phase={3}>
      Daily output, quality results and finished stock for your orders.
    </ComingSoon>
  );
}

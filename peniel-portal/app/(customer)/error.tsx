"use client";

import ErrorPanel from "@/components/ui/ErrorPanel";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} home={{ href: "/orders", label: "Back to your orders" }} />;
}

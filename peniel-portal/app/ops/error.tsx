"use client";

import ErrorPanel from "@/components/ui/ErrorPanel";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} home={{ href: "/ops", label: "Back to Peniel Ops" }} />;
}

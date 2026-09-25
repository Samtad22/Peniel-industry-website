"use client";

import ErrorPanel from "@/components/ui/ErrorPanel";

/** Errors outside the portal layouts (sign-in pages). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-bg">
      <ErrorPanel error={error} reset={reset} home={{ href: "/", label: "Go to the portal" }} />
    </main>
  );
}

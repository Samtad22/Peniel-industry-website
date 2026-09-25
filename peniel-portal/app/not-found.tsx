import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";

export const metadata: Metadata = { title: "Page not found" };

/** Any address outside the two portals. */
export default function NotFound() {
  return (
    <AuthCard title="Page not found" description="The link may be wrong or the page has moved.">
      <Link href="/" className="btn btn-primary btn-split min-h-12">
        Go to the portal<span aria-hidden="true">→</span>
      </Link>
    </AuthCard>
  );
}

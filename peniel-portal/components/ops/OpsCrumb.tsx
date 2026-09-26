"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { opsNavFor } from "@/lib/roles";

/** Top-bar breadcrumb: "OPS / 03 · ORDERS / PN-26-0004", from the page's place in the rail. */
export default function OpsCrumb({ current }: { current?: string }) {
  const item = opsNavFor(usePathname());
  return (
    <span className="min-w-0 truncate font-mono text-[11px] font-semibold uppercase tracking-[.1em]">
      OPS
      {item && (
        <>
          {" / "}
          <Link href={item.href} className="text-text no-underline hover:underline">
            {item.no} · {item.label}
          </Link>
        </>
      )}
      {current && <span className="text-accent-700"> / {current}</span>}
    </span>
  );
}

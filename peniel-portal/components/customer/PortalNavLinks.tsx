"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CUSTOMER_NAV } from "@/lib/roles";

export default function PortalNavLinks() {
  const pathname = usePathname();
  return (
    <>
      {CUSTOMER_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              "shrink-0 text-[14px] no-underline hover:text-accent " + (active ? "text-accent" : "text-inherit")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

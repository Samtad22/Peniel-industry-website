"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarkSeen } from "@/components/ui/useMarkSeen";
import { CUSTOMER_NAV } from "@/lib/roles";

/** Tabs whose badge means "new since you last looked" (Messages counts unread messages instead). */
const SEEN = ["orders", "production", "artwork", "documents"] as const;

export default function PortalNavLinks({ badges = {} }: { badges?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = CUSTOMER_NAV.find((i) => isActive(i.href));
  useMarkSeen(active?.area ?? null, active?.area ? (badges[active.area] ?? 0) : 0, SEEN);
  return (
    <>
      {CUSTOMER_NAV.map((item) => {
        const on = isActive(item.href);
        const n = item.area ? (badges[item.area] ?? 0) : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            aria-label={n ? `${item.label}, ${n} new` : undefined}
            className={
              "inline-flex shrink-0 items-center gap-1.5 text-[14px] no-underline hover:text-accent " + (on ? "text-accent" : "text-inherit")
            }
          >
            {item.label}
            {n > 0 && <span className="bg-accent px-[6px] py-px text-[11px] font-extrabold leading-[1.4] text-bg">{n > 99 ? "99+" : n}</span>}
          </Link>
        );
      })}
    </>
  );
}

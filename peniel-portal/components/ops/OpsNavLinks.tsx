"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type OpsNavItem = { href: string; label: string; badge?: number };

/** Sidebar links (OpsNav in the design). Active item: solid accent, bold. */
export default function OpsNavLinks({ items }: { items: OpsNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Peniel Ops" className="flex gap-0 overflow-x-auto md:flex-col md:overflow-visible md:py-2">
      {items.map((it) => {
        const active = it.href === "/ops" ? pathname === "/ops" : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={
              "flex shrink-0 items-center justify-between gap-3 whitespace-nowrap px-5 py-2.5 text-[14px] text-bg no-underline hover:text-bg " +
              (active ? "bg-accent font-extrabold" : "hover:bg-white/10")
            }
          >
            <span>{it.label}</span>
            {!!it.badge && (
              <span
                className={
                  "px-[7px] py-px text-[11px] font-extrabold " + (active ? "bg-bg text-text" : "bg-accent text-bg")
                }
              >
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

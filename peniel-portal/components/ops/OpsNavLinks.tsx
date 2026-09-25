"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarkSeen } from "@/components/ui/useMarkSeen";

export type OpsNavItem = { href: string; label: string; area?: string; badge?: number };

/** Tabs whose badge means "new since you last looked"; the others count work waiting (inbox, messages, held batches, artwork). */
const SEEN = ["orders", "production", "inventory", "documents", "settings"] as const;

const isActive = (href: string, pathname: string) => (href === "/ops" ? pathname === "/ops" : pathname === href || pathname.startsWith(`${href}/`));

/** Sidebar links (OpsNav in the design). Active item: solid accent, bold. */
export default function OpsNavLinks({ items }: { items: OpsNavItem[] }) {
  const pathname = usePathname();
  const active = items.find((it) => isActive(it.href, pathname));
  useMarkSeen(active?.area ?? null, active?.badge ?? 0, SEEN);
  return (
    <nav aria-label="Peniel Ops" className="flex gap-0 overflow-x-auto md:flex-col md:overflow-visible md:py-2">
      {items.map((it) => {
        const active = isActive(it.href, pathname);
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
                {it.badge > 99 ? "99+" : it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

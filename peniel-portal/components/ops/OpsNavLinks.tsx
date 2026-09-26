"use client";

import {
  Building2,
  Factory,
  FileText,
  Inbox,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Package,
  Palette,
  ShieldCheck,
  SlidersVertical,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTabBadges } from "@/components/ui/useTabBadges";
import { opsNavFor, type OpsArea, type OpsGroup } from "@/lib/roles";

export type OpsNavItem = { href: string; label: string; area: OpsArea; group: OpsGroup };

/** Tabs whose badge means "new since you last looked"; the others count work waiting (inbox, messages, held batches, artwork). */
const SEEN = ["orders", "production", "inventory", "documents", "settings"] as const;

const ICONS: Record<OpsArea, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  orders: Package,
  messages: MessageSquare,
  production: Factory,
  sheets: Layers,
  quality: ShieldCheck,
  inventory: Warehouse,
  maintenance: Wrench,
  artwork: Palette,
  documents: FileText,
  customers: Building2,
  settings: SlidersVertical,
};

const GROUPS: { group: OpsGroup; label: string }[] = [
  { group: "work", label: "WORK" },
  { group: "plant", label: "PLANT" },
  { group: "records", label: "RECORDS" },
];

/**
 * Paper rail links (OpsRail 3a): grouped Work / Plant / Records. The selected
 * item is an ink block with a red edge. On a phone the rail is a strip of
 * tabs that scrolls sideways.
 */
export default function OpsNavLinks({ items, badges: initial, asOf }: { items: OpsNavItem[]; badges: Record<string, number>; asOf: number }) {
  const pathname = usePathname();
  const current = opsNavFor(pathname)?.area ?? null;
  const badges = useTabBadges(initial, asOf, items.some((i) => i.area === current) ? current : null, SEEN);

  const link = (it: OpsNavItem) => {
    const on = it.area === current;
    const badge = badges[it.area] ?? 0;
    const Icon = ICONS[it.area];
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={on ? "page" : undefined}
        className={
          "flex shrink-0 items-center gap-3 whitespace-nowrap px-4 py-2.5 text-[14px] no-underline md:px-5 md:py-[9px] " +
          (on
            ? "bg-text font-extrabold text-bg shadow-[inset_0_-4px_0_var(--color-accent)] hover:text-bg md:shadow-[inset_5px_0_0_var(--color-accent)]"
            : "text-text hover:bg-text/[.07] hover:text-text")
        }
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
        <span className="md:flex-1">{it.label}</span>
        {badge > 0 && (
          <span
            className={
              "border-[1.5px] px-[7px] py-px text-[11px] font-extrabold leading-[1.3] " +
              (on ? "border-accent bg-accent text-bg" : "border-accent-700 text-accent-700")
            }
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav aria-label="Peniel Ops" className="flex overflow-x-auto md:flex-col md:overflow-visible md:pb-3">
      {GROUPS.map(({ group, label }) => {
        const mine = items.filter((i) => i.group === group);
        if (!mine.length) return null;
        return (
          <div key={group} className="contents md:flex md:flex-col">
            <div className="hidden px-5 pb-1.5 pt-[18px] font-mono text-[10px] font-semibold tracking-[.14em] text-neutral-600 md:block">{label}</div>
            {mine.map(link)}
          </div>
        );
      })}
    </nav>
  );
}

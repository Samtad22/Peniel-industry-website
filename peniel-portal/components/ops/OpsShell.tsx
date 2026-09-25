import Image from "next/image";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { initials, OPS_NAV, ROLE_LABELS, type StaffRole } from "@/lib/roles";
import OpsNavLinks from "./OpsNavLinks";

export type OpsBadges = Partial<Record<"inbox" | "messages" | "quality" | "artwork", number>>;

/** Peniel Ops frame: 232px ink sidebar (OpsNav) + main area. */
export default function OpsShell({
  name,
  role,
  badges,
  children,
}: {
  name: string;
  role: StaffRole;
  badges: OpsBadges;
  children: React.ReactNode;
}) {
  const visible = OPS_NAV.filter((n) => n.roles.includes(role));
  const hidden = OPS_NAV.length - visible.length;
  const items = visible.map((n) => ({
    href: n.href,
    label: n.label,
    badge: n.area in badges ? badges[n.area as keyof OpsBadges] : undefined,
  }));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="flex flex-col bg-text text-[14px] text-bg md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-2.5 border-b-2 border-neutral-800 px-5 py-[18px]">
          <Link href="/ops" className="flex flex-1 items-center gap-2.5 text-bg no-underline hover:text-bg">
            <Image src="/img/logo-icon.png" alt="" width={28} height={28} className="bg-bg" />
            <b className="text-[16px]">Peniel Ops</b>
          </Link>
          <SignOutButton className="text-[12px] text-bg/80 md:hidden" />
        </div>

        <div className="hidden border-b-2 border-neutral-800 px-4 pb-3.5 pt-3 md:block">
          <div className="text-[10px] uppercase tracking-[.1em] opacity-60">Your role</div>
          <div className="mt-1.5 border border-neutral-600 px-2.5 py-2 font-extrabold">{ROLE_LABELS[role]}</div>
        </div>

        <OpsNavLinks items={items} />

        <div className="hidden px-5 text-[11px] opacity-50 md:block">
          {hidden ? `${hidden} areas hidden for this role` : "All areas visible"}
        </div>

        <div className="mt-auto hidden items-center gap-2.5 border-t-2 border-neutral-800 px-5 py-3.5 text-[12px] md:flex">
          <span className="grid size-7 shrink-0 place-items-center bg-accent text-[11px] font-extrabold">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1 leading-[1.3]">
            <b className="block truncate">{name}</b>
            <span className="opacity-65">{ROLE_LABELS[role]}</span>
          </span>
          <SignOutButton className="text-[12px] text-bg/80" />
        </div>
      </aside>
      <main className="min-w-0 bg-bg">{children}</main>
    </div>
  );
}

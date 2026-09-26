import Image from "next/image";
import Link from "next/link";
import { initials, OPS_NAV, ROLE_LABELS, type StaffRole } from "@/lib/roles";
import OpsClock from "./OpsClock";
import OpsNavLinks from "./OpsNavLinks";

export type OpsBadges = Partial<
  Record<"inbox" | "messages" | "quality" | "artwork" | "orders" | "production" | "inventory" | "documents" | "settings", number>
>;

const SHORT_ROLE: Record<StaffRole, string> = { admin: "Admin", sales: "Sales & CS", production: "Production", quality: "Quality", warehouse: "Warehouse" };

/** The signed-in person at the foot of the rail; opens to sign out. */
function UserMenu({ name, role }: { name: string; role: StaffRole }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 border-2 border-text bg-bg px-2.5 py-2 [&::-webkit-details-marker]:hidden">
        <span className="grid size-[30px] shrink-0 place-items-center bg-text text-[11px] font-extrabold text-bg">{initials(name)}</span>
        <span className="min-w-0 flex-1 text-[12px] leading-[1.3]">
          <b className="block truncate">{name}</b>
          <span className="opacity-60">Viewing as {SHORT_ROLE[role]}</span>
        </span>
        <span className="text-[12px] transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="absolute inset-x-0 bottom-full mb-1 border-2 border-text bg-bg text-[13px] shadow-[var(--shadow-md)]">
        <div className="border-b border-divider px-3 py-2 opacity-70">{ROLE_LABELS[role]}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="w-full cursor-pointer border-0 bg-transparent px-3 py-2.5 text-left font-extrabold text-text hover:bg-text/[.07]">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

/** Peniel Ops frame: the paper rail (OpsRail 3a) + main area. On a phone the rail is a top bar with scrolling tabs. */
export default function OpsShell({
  name,
  role,
  badges,
  badgesAsOf = 0,
  children,
}: {
  name: string;
  role: StaffRole;
  badges: OpsBadges;
  /** When the badges were counted on the server (ms); the sidebar refreshes them after that. */
  badgesAsOf?: number;
  children: React.ReactNode;
}) {
  const items = OPS_NAV.filter((n) => n.roles.includes(role)).map((n) => ({ href: n.href, label: n.label, area: n.area, group: n.group }));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b-2 border-text bg-surface text-text md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r-2">
        <div className="flex items-center gap-3 border-b-2 border-text px-4 py-3 md:block md:px-5 md:pb-[18px] md:pt-[22px]">
          <Link href="/ops" className="flex flex-1 items-center gap-3 text-text no-underline hover:text-text">
            <Image src="/img/logo-icon.png" alt="" width={40} height={40} className="size-8 md:size-10" />
            <span className="leading-[.92]">
              <span className="block text-[20px] font-extrabold tracking-[-.03em] md:text-[24px]">PENIEL</span>
              <span className="block text-[20px] font-extrabold tracking-[-.03em] text-accent md:text-[24px]">OPS</span>
            </span>
          </Link>
          <div className="mt-3 hidden font-mono text-[10px] font-semibold tracking-[.12em] opacity-55 md:block">STAFF PORTAL · BOLE LEMI</div>
          <span className="text-right text-[12px] leading-[1.3] md:hidden">
            <b className="block">{name.split(" ")[0]}</b>
            <form action="/auth/signout" method="post" className="contents">
              <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-700 underline underline-offset-2">
                Sign out
              </button>
            </form>
          </span>
        </div>

        <OpsNavLinks items={items} badges={badges as Record<string, number>} asOf={badgesAsOf} />

        <div className="mt-auto hidden border-t-2 border-text md:block">
          <OpsClock initial={badgesAsOf} />
          <div className="mx-4 mb-4">
            <UserMenu name={name} role={role} />
          </div>
        </div>
      </aside>
      <main className="min-w-0 bg-bg">{children}</main>
    </div>
  );
}

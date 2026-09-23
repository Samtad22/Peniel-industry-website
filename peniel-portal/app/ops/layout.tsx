import Link from "next/link";
import Image from "next/image";
import NavLink from "@/components/NavLink";
import SignOutButton from "@/components/SignOutButton";
import { requireStaff } from "@/lib/auth";
import { OPS_NAV, ROLE_LABELS } from "@/lib/roles";

export const metadata = { title: { default: "Peniel Ops", template: "%s | Peniel Ops" } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const nav = OPS_NAV.filter((item) => item.roles.includes(profile.role));

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/ops" className="flex items-center gap-2.5">
            <Image src="/img/logo-icon.png" alt="" width={30} height={30} className="rounded-full bg-white p-0.5" />
            <span className="font-display text-[15px] font-semibold">Peniel Ops</span>
          </Link>
          {/* Narrow screens: the sidebar footer below is hidden, so sign-out lives here. */}
          <SignOutButton className="text-white/80 md:hidden" />
        </div>
        <nav aria-label="Ops" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.href === "/ops"} variant="side">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-4 py-4 text-sm md:block">
          <p className="font-medium">{profile.full_name}</p>
          <p className="text-xs text-white/60">{ROLE_LABELS[profile.role]}</p>
          <SignOutButton className="mt-3 text-white/80" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}

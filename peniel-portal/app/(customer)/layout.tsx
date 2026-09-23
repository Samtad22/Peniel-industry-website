import Link from "next/link";
import Logo from "@/components/ui/Logo";
import NavLink from "@/components/NavLink";
import SignOutButton from "@/components/SignOutButton";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_NAV } from "@/lib/roles";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireCustomer();
  const supabase = await createClient();
  const { data: company } = await supabase.from("customer_company").select("name").maybeSingle();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
          <Link href="/orders">
            <Logo subtitle={company?.name ?? "Customer portal"} />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">{profile.full_name}</span>
            <SignOutButton className="text-navy" />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 sm:px-6" aria-label="Main">
          {CUSTOMER_NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

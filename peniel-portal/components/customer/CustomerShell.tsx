import Image from "next/image";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { initials } from "@/lib/roles";
import PortalNavLinks from "./PortalNavLinks";

/** Customer portal frame: the PortalNav bar from the design, then the page. */
export default function CustomerShell({
  userName,
  companyName,
  children,
}: {
  userName: string;
  companyName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b-2 border-divider bg-bg px-4 py-3.5 sm:px-10">
        <Link href="/orders" className="flex items-center gap-2.5 text-text no-underline hover:text-text lg:mr-5">
          <Image src="/img/logo-icon.png" alt="" width={28} height={28} priority />
          <span className="text-[16px] font-extrabold">
            Peniel<span className="max-sm:hidden"> · Customer Portal</span>
          </span>
        </Link>
        <nav aria-label="Customer portal" className="order-last flex w-full gap-7 overflow-x-auto lg:order-none lg:w-auto">
          <PortalNavLinks />
        </nav>
        <span className="ml-auto flex items-center gap-2.5 text-[13px] lg:border-l-2 lg:border-divider lg:pl-5">
          <span
            className="grid size-7 shrink-0 place-items-center bg-text text-[11px] font-extrabold text-bg"
            title={userName}
          >
            {initials(userName)}
          </span>
          <span className="hidden sm:inline">{companyName}</span>
          <SignOutButton className="text-[12px] text-neutral-700" />
        </span>
        <Link href="/orders/new" className="btn btn-primary max-sm:min-h-11">
          + New<span className="max-sm:hidden">&nbsp;order</span>
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}

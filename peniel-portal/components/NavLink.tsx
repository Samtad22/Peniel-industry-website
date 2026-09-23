"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function NavLink({
  href,
  children,
  exact = false,
  variant = "tab",
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  variant?: "tab" | "side";
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "text-sm font-medium transition-colors",
        variant === "tab" && [
          "whitespace-nowrap border-b-2 px-1 py-3",
          active ? "border-orange text-ink" : "border-transparent text-muted hover:text-ink",
        ],
        variant === "side" && [
          "block rounded-lg px-3 py-2",
          active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
        ],
      )}
    >
      {children}
    </Link>
  );
}

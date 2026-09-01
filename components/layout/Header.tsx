"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import LogoMark from "@/components/LogoMark";
import { useScrolledPast } from "@/lib/hooks";
import { NAV_LINKS, CONTACT_CTA } from "@/lib/constants";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [navOpen, setNavOpen] = useState(false);

  // On the home page, the hero is a full-bleed photo, so the header starts
  // transparent and solidifies on scroll. Every other page has a solid navy
  // hero band immediately, so the header is solid from the start there too.
  const scrolledPastThreshold = useScrolledPast(12);
  const scrolled = !isHome || scrolledPastThreshold;

  const transparent = isHome && !scrolled;

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-[background,box-shadow,border-color] duration-300"
      style={{
        background: transparent ? "transparent" : "rgba(250,249,246,0.96)",
        backdropFilter: transparent ? "none" : "blur(10px)",
        borderBottom: `1px solid ${transparent ? "transparent" : "#E7E9EC"}`,
        boxShadow: transparent ? "none" : "0 2px 16px rgba(27,36,48,0.06)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Peniel Industry PLC home">
          <LogoMark size={32} />
          <span
            className="font-logo text-[19px] font-extrabold tracking-[-0.03em]"
            style={{
              color: transparent ? "#fff" : "var(--color-orange)",
              textShadow: transparent ? "0 2px 10px rgba(0,0,0,0.35)" : "none",
            }}
          >
            PENIEL{" "}
            <span
              className="font-bold"
              style={{ color: transparent ? "rgba(255,255,255,0.85)" : "var(--color-navy)" }}
            >
              INDUSTRY
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="border-b-2 pb-1 text-[14px] font-medium transition-colors"
                style={{
                  color: active ? "var(--color-orange)" : transparent ? "#fff" : "var(--color-graphite)",
                  borderColor: active ? "var(--color-orange)" : "transparent",
                  textShadow: transparent ? "0 1px 6px rgba(0,0,0,0.35)" : "none",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={CONTACT_CTA.href}
            className="hidden items-center gap-2 rounded-full px-5 py-2.5 text-[14.5px] font-bold transition-transform hover:-translate-y-0.5 lg:inline-flex"
            style={{
              color: scrolled ? "#fff" : "var(--color-orange-deep)",
              background: scrolled ? "var(--color-orange)" : "#fff",
              boxShadow: scrolled ? "0 8px 18px rgba(241,83,28,0.28)" : "0 8px 18px rgba(0,0,0,0.15)",
            }}
          >
            {CONTACT_CTA.label}
          </Link>
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={navOpen}
            className="p-1.5 lg:hidden"
            style={{ color: transparent ? "#fff" : "var(--color-navy)" }}
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {navOpen && (
        <div className="flex flex-col gap-1 border-t border-[#E7E9EC] bg-white px-6 pb-5 pt-2 lg:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setNavOpen(false)}
              className="py-2.5 text-[15px] text-graphite"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={CONTACT_CTA.href}
            onClick={() => setNavOpen(false)}
            className="mt-2 rounded-full bg-orange px-5 py-3 text-center text-[15px] font-bold text-white"
          >
            {CONTACT_CTA.label}
          </Link>
        </div>
      )}
    </header>
  );
}

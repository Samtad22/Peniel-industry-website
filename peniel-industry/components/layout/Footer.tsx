import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { COMPANY, NAV_LINKS } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-navy px-6 pb-7 pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2.5">
              <LogoMark size={28} gearColor="var(--color-steel)" spin={false} />
              <span className="font-logo text-[16px] font-extrabold tracking-[-0.03em] text-white">
                PENIEL <span className="font-bold text-orange-light">INDUSTRY</span>
              </span>
            </div>
            <p className="max-w-xs text-[13.5px] leading-relaxed text-white/55">{COMPANY.tagline}</p>
          </div>

          <div>
            <p className="mb-3 font-brandmono text-[11px] uppercase tracking-[0.1em] text-white/40">Site</p>
            <ul className="flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[13.5px] text-white/70 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/contact" className="text-[13.5px] text-white/70 hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 font-brandmono text-[11px] uppercase tracking-[0.1em] text-white/40">Contact</p>
            <ul className="flex flex-col gap-2 text-[13.5px] text-white/70">
              <li>{COMPANY.addressLine}</li>
              <li>
                <a href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`} className="hover:text-white">
                  {COMPANY.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
                  {COMPANY.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="pt-6 text-center text-[12px] text-white/35">
          © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

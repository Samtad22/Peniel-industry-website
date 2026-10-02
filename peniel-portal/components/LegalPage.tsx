import Image from "next/image";
import Link from "next/link";

/** The privacy notice and terms of use: public pages, readable signed in or not. */
export default function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center gap-3 border-b-2 border-divider px-4 py-3.5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-text no-underline hover:text-text">
          <Image src="/img/logo-icon.png" alt="" width={28} height={28} priority />
          <span className="text-[16px] font-extrabold">Peniel Industry PLC</span>
        </Link>
        <Link href="/" className="ml-auto text-[13px]">
          Back to the portal →
        </Link>
      </header>
      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="m-0 text-[40px] leading-tight sm:text-[48px]">{title}</h1>
          <p className="m-0 mt-2 text-[13px] opacity-65">Last updated {updated}</p>
        </div>
        <div className="text-[15px] leading-relaxed">{intro}</div>
        <div className="legal flex flex-col gap-6 text-[15px] leading-relaxed [&_h2]:m-0 [&_h2]:mb-2 [&_h2]:text-[22px] [&_li]:mb-1.5 [&_p]:m-0 [&_p]:mb-2 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <LegalLinks className="border-t-2 border-divider pt-4" />
      </main>
    </div>
  );
}

/** "Privacy · Terms", for the sign-in pages and the customer portal footer. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap gap-x-4 gap-y-1 text-[12px] ${className}`}>
      <Link href="/privacy" className="text-text/70">
        Privacy notice
      </Link>
      <Link href="/terms" className="text-text/70">
        Terms of use
      </Link>
      <span className="opacity-55">© Peniel Industry PLC · Bole Lemi Industrial Park, Addis Ababa</span>
    </nav>
  );
}

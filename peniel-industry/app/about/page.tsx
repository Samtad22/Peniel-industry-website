import type { Metadata } from "next";
import Image from "next/image";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { COMPANY, GROWTH_TIMELINE, PARTNERS } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About Us",
  description: `${COMPANY.legalName} is one of Ethiopia's leading manufacturers of crown corks, headquartered in ${COMPANY.addressLine}.`,
  alternates: { canonical: "/about" },
  openGraph: ogImage("Built on a simple conviction", "About Us"),
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Us"
        title="Built on a simple conviction"
        intro="That Ethiopia's fast-growing beverage industry deserves a domestic supplier capable of meeting international quality standards."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
          <Reveal className="relative aspect-[4/3] overflow-hidden rounded-[20px] shadow-[0_24px_48px_rgba(27,36,48,0.16)]">
            <Image
              src="/img/factory-exterior.jpg"
              alt={`${COMPANY.legalName} facility, ${COMPANY.addressLine}`}
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              style={{ objectFit: "cover" }}
            />
          </Reveal>
          <div>
            <Eyebrow>Our Story</Eyebrow>
            <Reveal delay={80}>
              <h2 className="mb-4 max-w-md text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold leading-tight text-graphite">
                Ethiopian-made quality, built for industrial scale
              </h2>
            </Reveal>
            <Reveal delay={140}>
              <p className="mb-4 max-w-md text-[15.5px] leading-relaxed text-muted">
                {COMPANY.legalName} is one of Ethiopia&apos;s leading manufacturers of crown corks,
                headquartered in {COMPANY.addressLine}. Founded by {COMPANY.founderTitle}{" "}
                {COMPANY.founder}, the company was built on a simple conviction: that Ethiopia&apos;s
                fast-growing beverage industry deserves a domestic supplier capable of meeting
                international quality standards.
              </p>
            </Reveal>
            <Reveal delay={180}>
              <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
                Today, {COMPANY.legalName} operates advanced manufacturing facilities dedicated
                exclusively to crown cork production, serving breweries, soft drink producers, and
                bottled water companies nationwide. Every cap that leaves our facility reflects a
                single standard: precision, consistency, and reliability at scale.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="bg-navy px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <Eyebrow tone="onDark">Our Growth</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mb-14 max-w-lg text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold text-white">
              From founding to a trusted, nationwide supplier
            </h2>
          </Reveal>
          <div className="flex flex-col gap-8">
            {GROWTH_TIMELINE.map((stage, i) => (
              <Reveal key={stage.title} delay={i * 80}>
                <div className="flex gap-5 border-l-2 border-white/15 pl-6">
                  <div className="flex-1">
                    <p className="mb-1 font-brandmono text-[11px] uppercase tracking-[0.12em] text-orange-light">
                      Stage {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mb-1.5 text-[17px] font-bold text-white">{stage.title}</h3>
                    <p className="max-w-xl text-[14.5px] leading-relaxed text-white/65">{stage.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="mb-2 text-center text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold text-graphite">
              Our Partners
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mx-auto mb-10 max-w-xl text-center text-[15px] leading-relaxed text-muted">
              Banks, producers, and institutional partners we&apos;re proud to work alongside.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            {PARTNERS.map((p, i) => (
              <Reveal key={p.name} delay={i * 30}>
                <div
                  title={p.name}
                  className="flex h-[78px] items-center justify-center rounded-[10px] border border-[#E7E9EC] bg-white p-3.5"
                >
                  <div className="relative h-full w-full">
                    <Image src={`/img/partners/${p.logo}.png`} alt={p.name} fill sizes="160px" style={{ objectFit: "contain" }} />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

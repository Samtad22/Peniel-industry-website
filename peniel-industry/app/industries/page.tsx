import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import { PrimaryButton } from "@/components/ui/Buttons";
import { Beer, CupSoda, Droplets } from "lucide-react";
import { INDUSTRIES, PARTNERS } from "@/lib/constants";
import { ogImage } from "@/lib/seo";
import Image from "next/image";

const ICONS = { breweries: Beer, "soft-drinks": CupSoda, "bottled-water": Droplets } as const;

export const metadata: Metadata = {
  title: "Industries Served",
  description:
    "Peniel Industry PLC supplies crown corks to breweries, soft drink producers, and bottled water companies across Ethiopia.",
  alternates: { canonical: "/industries" },
  openGraph: ogImage("Built for Ethiopia's beverage industry", "Industries Served"),
};

export default function IndustriesPage() {
  return (
    <>
      <PageHero
        eyebrow="Industries Served"
        title="Built for Ethiopia's beverage industry"
        intro="From breweries to bottled water, we supply crown corks engineered for the specific demands of each segment we serve."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {INDUSTRIES.map((ind, i) => {
              const Icon = ICONS[ind.key as keyof typeof ICONS];
              return (
                <Reveal key={ind.key} delay={i * 100}>
                  <div className="h-full rounded-2xl border border-[#E7E9EC] bg-white p-8">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#FFF1E5]">
                      <Icon size={24} className="text-orange" />
                    </div>
                    <h2 className="mb-2.5 text-xl font-bold text-graphite">{ind.title}</h2>
                    <p className="text-[14.5px] leading-relaxed text-muted">{ind.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-navy-tint px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="mb-2 text-center text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold text-navy">
              Trusted across Ethiopia&apos;s beverage sector
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mx-auto mb-10 max-w-xl text-center text-[15px] leading-relaxed text-muted">
              A selection of the banks, producers, and institutional partners we work alongside.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            {PARTNERS.map((p, i) => (
              <Reveal key={p.name} delay={i * 30}>
                <div
                  title={p.name}
                  className="flex h-[78px] items-center justify-center rounded-[10px] border border-navy/10 bg-white p-3.5"
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

      <section className="bg-porcelain px-6 py-20 text-center">
        <div className="mx-auto max-w-xl">
          <Reveal>
            <h2 className="mb-4 text-2xl font-extrabold text-graphite">Don&apos;t see your segment listed?</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mb-8 text-[15.5px] leading-relaxed text-muted">
              Reach out and tell us about your product — we&apos;re happy to discuss whether our
              crown corks are a fit.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <PrimaryButton href="/contact">Talk to Our Team</PrimaryButton>
          </Reveal>
        </div>
      </section>
    </>
  );
}

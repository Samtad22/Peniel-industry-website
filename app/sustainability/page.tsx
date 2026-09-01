import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import { Zap, CheckCircle2, Recycle, Building2 } from "lucide-react";
import { SUSTAINABILITY_PILLARS } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

const ICONS = { efficient: Zap, responsible: CheckCircle2, waste: Recycle, local: Building2 } as const;

export const metadata: Metadata = {
  title: "Sustainability",
  description:
    "How Peniel Industry PLC approaches sustainability: efficient manufacturing, responsible production, waste reduction, and supporting local industry.",
  alternates: { canonical: "/sustainability" },
  openGraph: ogImage("Manufacturing responsibly, for the long term", "Sustainability"),
};

export default function SustainabilityPage() {
  return (
    <>
      <PageHero
        eyebrow="Sustainability"
        title="Manufacturing responsibly, for the long term"
        intro="As a manufacturer serving Ethiopia's beverage industry, we recognize our responsibility to operate efficiently and reduce our environmental footprint, while strengthening the local industrial base we're part of."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SUSTAINABILITY_PILLARS.map((p, i) => {
              const Icon = ICONS[p.key as keyof typeof ICONS];
              return (
                <Reveal key={p.key} delay={i * 80}>
                  <div className="h-full rounded-2xl border border-[#E7E9EC] bg-white p-7">
                    <div
                      className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[12px]"
                      style={{ background: i % 2 === 0 ? "#FFF1E5" : "var(--color-navy-tint)" }}
                    >
                      <Icon size={22} className={i % 2 === 0 ? "text-orange" : "text-navy"} />
                    </div>
                    <h2 className="mb-2.5 text-[16.5px] font-bold text-graphite">{p.title}</h2>
                    <p className="text-[14px] leading-relaxed text-muted">{p.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-navy-tint px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="mb-5 text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold text-navy">
              A responsibility we take seriously, and a work in progress
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="text-[16px] leading-relaxed text-muted">
              We don&apos;t publish sustainability figures we can&apos;t stand behind. As formal
              environmental metrics and targets are documented, this page will be updated to reflect
              them. In the meantime, the commitments above describe how we approach manufacturing
              today.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

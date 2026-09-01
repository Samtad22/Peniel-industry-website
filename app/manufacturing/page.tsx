import type { Metadata } from "next";
import Image from "next/image";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { PrimaryButton } from "@/components/ui/Buttons";
import { PROCESS_STEPS, COMPANY } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Manufacturing Capabilities",
  description:
    "From raw tinplate to finished crown cork: how Peniel Industry PLC combines automated precision with disciplined quality control at every stage of production.",
  alternates: { canonical: "/manufacturing" },
  openGraph: ogImage("From raw tinplate to finished crown cork", "Manufacturing"),
};

export default function ManufacturingPage() {
  return (
    <>
      <PageHero
        eyebrow="Manufacturing"
        title="From raw tinplate to finished crown cork"
        intro="Our facility combines automated precision with disciplined quality control at every stage of production."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="relative mb-16">
            <div className="absolute left-0 right-0 top-[26px] hidden h-0.5 bg-[#DDE1E6] md:block" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5">
              {PROCESS_STEPS.map((step, i) => (
                <Reveal key={step.n} delay={i * 90}>
                  <div>
                    <div className="relative z-[1] mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-orange bg-white">
                      <span className="font-brandmono text-[13px] font-semibold text-orange">{step.n}</span>
                    </div>
                    <h3 className="mb-1.5 text-[15.5px] font-bold text-graphite">{step.title}</h3>
                    <p className="text-[13.5px] leading-relaxed text-muted">{step.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
            <Reveal className="relative aspect-[4/3] overflow-hidden rounded-[20px] shadow-[0_24px_48px_rgba(27,36,48,0.16)]">
              <Image
                src="/img/factory-exterior.jpg"
                alt="Peniel Industry PLC facility, Bole Lemi Industrial Park"
                fill
                sizes="(min-width: 1024px) 45vw, 90vw"
                style={{ objectFit: "cover" }}
              />
            </Reveal>
            <div>
              <Eyebrow>Dedicated Facility</Eyebrow>
              <Reveal delay={80}>
                <h2 className="mb-4 max-w-md text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold leading-tight text-graphite">
                  A facility built exclusively for crown cork production
                </h2>
              </Reveal>
              <Reveal delay={140}>
                <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
                  {COMPANY.legalName} operates advanced manufacturing facilities at{" "}
                  {COMPANY.addressLine}, dedicated exclusively to crown cork production. Automated
                  stamping and forming equipment works alongside multi-point inspection to keep
                  every batch within tight, controlled tolerances, from the first tinplate coil to
                  the finished, packed cap.
                </p>
              </Reveal>
              <Reveal delay={200} className="mt-8">
                <PrimaryButton href="/quality">See Our Quality Standards</PrimaryButton>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import CrownCapSVG from "@/components/ui/CrownCapSVG";
import { PrimaryButton, GhostButton } from "@/components/ui/Buttons";
import { CheckCircle2 } from "lucide-react";
import { PRODUCTS, PRODUCT_ATTRIBUTES } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Crown corks engineered for performance: standard crown corks, custom colors & printing, and high-speed line compatible caps.",
  alternates: { canonical: "/products" },
  openGraph: ogImage("Crown corks, engineered for performance", "Our Products"),
};

export default function ProductsPage() {
  return (
    <>
      <PageHero
        eyebrow="Our Products"
        title="Crown corks, engineered for performance"
        intro="Every crown cork we manufacture is built to protect what's inside the bottle — from carbonation to freshness — while performing flawlessly on modern high-speed bottling lines."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            {PRODUCTS.map((p, i) => (
              <Reveal key={p.slug} delay={i * 100}>
                <div className="flex h-full flex-col rounded-2xl border border-[#E7E9EC] bg-white p-8 shadow-[0_4px_16px_rgba(27,36,48,0.05)]">
                  <div className="mb-6 flex justify-center">
                    <CrownCapSVG size={110} />
                  </div>
                  <span
                    className="mb-3 inline-block w-fit rounded-full border px-2.5 py-1 font-brandmono text-[11px] tracking-[0.12em]"
                    style={{
                      color: i === 2 ? "var(--color-navy)" : "var(--color-orange)",
                      borderColor:
                        i === 2
                          ? "color-mix(in srgb, var(--color-navy) 35%, transparent)"
                          : "color-mix(in srgb, var(--color-orange) 35%, transparent)",
                    }}
                  >
                    {p.tagline.toUpperCase()}
                  </span>
                  <h2 className="mb-3 text-xl font-bold text-graphite">{p.name}</h2>
                  <p className="mb-5 text-[14.5px] leading-relaxed text-muted">{p.desc}</p>
                  <ul className="mt-auto flex flex-col gap-2.5 border-t border-[#F0F1F3] pt-5">
                    {p.outcomes.map((o) => (
                      <li key={o} className="flex items-start gap-2.5 text-[13.5px] text-graphite">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-orange" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy-tint px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow>Built In, Every Cap</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mb-10 max-w-xl text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold leading-tight text-navy">
              Attributes that come standard across our product line
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_ATTRIBUTES.map((a, i) => (
              <Reveal key={a.title} delay={i * 60}>
                <div className="h-full rounded-[14px] border border-navy/15 bg-white p-5">
                  <h3 className="mb-1.5 text-[15px] font-bold text-navy">{a.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-muted">{a.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-porcelain px-6 py-20 text-center">
        <div className="mx-auto max-w-xl">
          <Reveal>
            <h2 className="mb-4 text-2xl font-extrabold text-graphite">
              Need a specification tailored to your line?
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mb-8 text-[15.5px] leading-relaxed text-muted">
              Tell us your product type, volume, and requirements, and our team will follow up with
              a quote.
            </p>
          </Reveal>
          <Reveal delay={140} className="flex flex-wrap justify-center gap-3.5">
            <PrimaryButton href="/contact">Request a Quote</PrimaryButton>
            <GhostButton href="/manufacturing" showArrow={false}>
              See How We Make Them
            </GhostButton>
          </Reveal>
        </div>
      </section>
    </>
  );
}

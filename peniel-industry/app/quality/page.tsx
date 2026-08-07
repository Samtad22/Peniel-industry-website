import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { ShieldCheck, FileCheck } from "lucide-react";
import { QUALITY_PRACTICES } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Quality, Safety & Certifications",
  description:
    "How Peniel Industry PLC approaches quality control: multi-point inspection, food-grade coatings, and batch-tested output.",
  alternates: { canonical: "/quality" },
  openGraph: ogImage("Precision, consistency, reliability", "Quality Control"),
};

export default function QualityPage() {
  return (
    <>
      <PageHero
        eyebrow="Quality Control"
        title="Every cap reflects one standard: precision, consistency, reliability"
        intro="Multi-point inspection runs throughout the production process — not only at the end of the line — backed by strict, standards-driven quality assurance and food-grade compliant liners and coatings."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {QUALITY_PRACTICES.map((item, i) => (
              <Reveal key={item.title} delay={i * 70}>
                <div className="h-full rounded-2xl border border-[#E7E9EC] bg-white p-6">
                  <ShieldCheck size={20} className="mb-3 text-orange" />
                  <h3 className="mb-1.5 text-[15px] font-bold text-graphite">{item.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-muted">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow tone="onDark">How We Work</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mb-5 text-[clamp(1.7rem,3vw,2.3rem)] font-extrabold text-white">
              Quality checked throughout, not just at the end
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="text-[16px] leading-relaxed text-white/75">
              Rather than relying on a single inspection at the end of the line, quality checks are
              built into the production process itself — from raw tinplate handling through
              forming, coating, and printing, up to final packing. This is the same disciplined
              approach behind every batch we ship, regardless of order size.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <div className="rounded-2xl border border-dashed border-steel bg-white p-8 text-center">
              <FileCheck size={28} className="mx-auto mb-4 text-muted" />
              <h2 className="mb-3 text-xl font-bold text-graphite">Certifications</h2>
              <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-muted">
                We hold ourselves to strict internal quality and food-safety standards throughout
                production, described above. Formal third-party certifications (such as ISO or
                food-safety management standards) are not yet documented for publication on this
                site.{" "}
                <span className="font-semibold text-graphite">
                  [Verification required — to be added once certification documentation is
                  supplied.]
                </span>{" "}
                If you need certification details for a procurement process, please contact us
                directly.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

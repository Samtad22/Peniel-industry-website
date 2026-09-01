import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import { FileText } from "lucide-react";
import { FAQS } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Insights & Resources",
  description: "Frequently asked questions about Peniel Industry PLC's crown corks and manufacturing.",
  alternates: { canonical: "/insights" },
  openGraph: ogImage("Frequently asked questions", "Insights & Resources"),
};

export default function InsightsPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <PageHero
        eyebrow="Insights & Resources"
        title="Frequently asked questions"
        intro="Straight answers about our products, capabilities, and how to work with us."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-4">
            {FAQS.map((item, i) => (
              <Reveal key={item.q} delay={i * 60}>
                <details className="group rounded-2xl border border-[#E7E9EC] bg-white p-6 open:shadow-[0_4px_16px_rgba(27,36,48,0.05)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-bold text-graphite">
                    {item.q}
                    <span className="shrink-0 text-orange transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy-tint px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <FileText size={28} className="mx-auto mb-4 text-navy" />
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mb-3 text-xl font-bold text-navy">Documents & Spec Sheets</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-[14.5px] leading-relaxed text-muted">
              A downloadable resource library with product spec sheets, technical drawings, and
              guides is in progress and will be published here once available.{" "}
              <span className="font-semibold text-graphite">[Verification required]</span> In the
              meantime, contact our team directly for any technical documentation you need.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

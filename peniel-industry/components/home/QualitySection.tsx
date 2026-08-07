import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { ShieldCheck } from "lucide-react";
import { QUALITY_PRACTICES } from "@/lib/constants";

export default function QualitySection() {
  return (
    <section id="quality" className="bg-navy-tint px-6 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12">
        <div>
          <Eyebrow>Quality Control</Eyebrow>
          <Reveal delay={80}>
            <h2 className="mb-[18px] max-w-xl text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-navy">
              Every cap reflects one standard: precision, consistency, reliability
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="max-w-xl text-base leading-relaxed text-muted">
              Multi-point inspection runs throughout the production process — not only at the end of
              the line — backed by strict, standards-driven quality assurance and food-grade
              compliant liners and coatings.
            </p>
          </Reveal>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUALITY_PRACTICES.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <div className="h-full rounded-[14px] border border-navy/15 bg-white p-5">
                <ShieldCheck size={18} className="mb-2.5 text-orange" />
                <h4 className="mb-1.5 text-[14.5px] font-bold text-navy">{item.title}</h4>
                <p className="text-[13px] leading-relaxed text-muted">{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

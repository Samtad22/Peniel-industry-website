import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { Zap, CheckCircle2, Recycle, Building2 } from "lucide-react";
import { SUSTAINABILITY_PILLARS } from "@/lib/constants";

const ICONS = { efficient: Zap, responsible: CheckCircle2, waste: Recycle, local: Building2 } as const;

export default function SustainabilitySection() {
  return (
    <section id="sustainability" className="bg-porcelain px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Eyebrow>Sustainability</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="mb-4 max-w-xl text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-graphite">
            Manufacturing responsibly, for the long term
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="mb-12 max-w-xl text-[16.5px] leading-relaxed text-muted">
            As a manufacturer serving Ethiopia&apos;s beverage industry, we recognize our
            responsibility to operate efficiently and reduce our environmental footprint, while
            strengthening the local industrial base we&apos;re part of.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SUSTAINABILITY_PILLARS.map((p, i) => {
            const Icon = ICONS[p.key as keyof typeof ICONS];
            return (
              <Reveal key={p.key} delay={i * 80}>
                <div className="h-full rounded-2xl border border-[#E7E9EC] bg-white p-6">
                  <div
                    className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[10px]"
                    style={{ background: i % 2 === 0 ? "#FFF1E5" : "var(--color-navy-tint)" }}
                  >
                    <Icon size={20} className={i % 2 === 0 ? "text-orange" : "text-navy"} />
                  </div>
                  <h4 className="mb-2 text-[15.5px] font-bold text-graphite">{p.title}</h4>
                  <p className="text-[13.5px] leading-relaxed text-muted">{p.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

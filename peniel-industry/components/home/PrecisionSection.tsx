import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { PROCESS_STEPS } from "@/lib/constants";

export default function PrecisionSection() {
  return (
    <section id="precision" className="bg-porcelain px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Eyebrow>Manufacturing</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="mb-4 max-w-xl text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-graphite">
            From raw tinplate to finished crown cork
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="mb-14 max-w-xl text-[16.5px] leading-relaxed text-muted">
            Our facility combines automated precision with disciplined quality control at every
            stage of production.
          </p>
        </Reveal>

        <div className="relative">
          <div className="absolute left-0 right-0 top-[26px] hidden h-0.5 bg-[#DDE1E6] md:block" aria-hidden="true" />
          <div className="grid grid-cols-2 gap-7 sm:grid-cols-3 md:grid-cols-5">
            {PROCESS_STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 80}>
                <div>
                  <div className="relative z-[1] mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-orange bg-white">
                    <span className="font-brandmono text-[13px] font-semibold text-orange">{step.n}</span>
                  </div>
                  <h4 className="mb-1.5 text-[15.5px] font-bold text-graphite">{step.title}</h4>
                  <p className="text-[13.5px] leading-relaxed text-muted">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

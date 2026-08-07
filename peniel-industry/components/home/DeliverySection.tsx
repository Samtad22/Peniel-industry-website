import Image from "next/image";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { PARTNERS } from "@/lib/constants";

export default function DeliverySection() {
  return (
    <section id="delivery" className="bg-porcelain px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14">
          <Reveal>
            <Eyebrow>Ready for Delivery</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mb-4 max-w-xl text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-graphite">
              Trusted by Ethiopia&apos;s leading producers
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="max-w-xl text-base leading-relaxed text-muted">
              Batch-tested crown corks, packed and dispatched to breweries, soft drink producers,
              and bottled water companies across Ethiopia.
            </p>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <p className="mb-[18px] font-brandmono text-[11px] tracking-[0.1em] text-muted">OUR PARTNERS</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {PARTNERS.map((p, i) => (
            <Reveal key={p.name} delay={i * 30}>
              <div
                title={p.name}
                className="flex h-[78px] items-center justify-center rounded-[10px] border border-[#E7E9EC] bg-white p-3.5"
              >
                <div className="relative h-full w-full">
                  <Image
                    src={`/img/partners/${p.logo}.png`}
                    alt={p.name}
                    fill
                    sizes="160px"
                    style={{ objectFit: "contain" }}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { PRODUCTS } from "@/lib/constants";

export default function ProductsSection() {
  return (
    <section id="design" className="bg-porcelain px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Eyebrow>Our Products</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="mb-4 max-w-xl text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-graphite">
            Crown corks, engineered for performance
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="mb-12 max-w-xl text-base leading-relaxed text-muted">
            Every crown cork we manufacture is built to protect what&apos;s inside the bottle, from
            carbonation to freshness, while performing flawlessly on modern high-speed bottling lines.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.slug} delay={i * 90}>
              <div
                className="h-full rounded-2xl border border-[#E7E9EC] bg-white p-7 shadow-[0_4px_16px_rgba(27,36,48,0.05)] transition-transform hover:-translate-y-1"
                style={{ borderTop: `3px solid ${i === 2 ? "var(--color-navy)" : "var(--color-orange)"}` }}
              >
                <span
                  className="inline-block rounded-full border px-2.5 py-1 font-brandmono text-[11px] tracking-[0.12em]"
                  style={{
                    color: i === 2 ? "var(--color-navy)" : "var(--color-orange)",
                    borderColor: i === 2 ? "color-mix(in srgb, var(--color-navy) 35%, transparent)" : "color-mix(in srgb, var(--color-orange) 35%, transparent)",
                  }}
                >
                  PRODUCT {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="my-4 text-[19px] font-bold text-graphite">{p.name}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

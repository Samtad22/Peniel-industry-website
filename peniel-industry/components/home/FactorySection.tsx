import Image from "next/image";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { CheckCircle2 } from "lucide-react";
import { COMPANY } from "@/lib/constants";

const CHECKLIST = [
  "Specialized crown cork manufacturing",
  "Advanced, purpose-built production lines",
  "Rigorous, standards-driven quality control",
  "Committed to Ethiopia's industrial growth",
];

export default function FactorySection() {
  return (
    <section id="factory" className="bg-porcelain px-6 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <Reveal className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] shadow-[0_24px_48px_rgba(27,36,48,0.16)]">
            <Image
              src="/img/factory-exterior.jpg"
              alt="Peniel Industry PLC facility, Bole Lemi Industrial Park, Addis Ababa"
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <span className="absolute bottom-5 left-5 rounded-full bg-white px-[18px] py-2.5 text-[13.5px] font-bold text-graphite shadow-[0_8px_20px_rgba(27,36,48,0.18)]">
            Bole Lemi Industrial Park · Addis Ababa
          </span>
        </Reveal>

        <div>
          <Reveal>
            <Eyebrow>About {COMPANY.legalName}</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mb-5 max-w-md text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-navy">
              Ethiopian-made quality, built for industrial scale
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mb-[18px] max-w-md text-[15.5px] leading-relaxed text-muted">
              {COMPANY.legalName} is one of Ethiopia&apos;s leading manufacturers of crown corks,
              headquartered in {COMPANY.addressLine}. Founded by {COMPANY.founderTitle}{" "}
              {COMPANY.founder}, the company was built on a simple conviction: that Ethiopia&apos;s
              fast-growing beverage industry deserves a domestic supplier capable of meeting
              international quality standards.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <p className="mb-8 max-w-md text-[15.5px] leading-relaxed text-muted">
              Today, {COMPANY.legalName} operates advanced manufacturing facilities dedicated
              exclusively to crown cork production, serving breweries, soft drink producers, and
              bottled water companies nationwide. Every cap that leaves our facility reflects a
              single standard: precision, consistency, and reliability at scale.
            </p>
          </Reveal>
          <div className="flex flex-col gap-3.5">
            {CHECKLIST.map((text, i) => (
              <Reveal key={text} delay={220 + i * 60}>
                <div className="flex items-center gap-3">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#FFF1E5]">
                    <CheckCircle2 size={15} className="text-orange" />
                  </span>
                  <span className="text-[15px] font-semibold text-graphite">{text}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import Image from "next/image";
import Reveal from "@/components/ui/Reveal";
import { PrimaryButton, GhostButton } from "@/components/ui/Buttons";
import { useMediaQuery, useScrollY } from "@/lib/hooks";
import { COMPANY } from "@/lib/constants";

export default function HeroArrival() {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const scrollY = useScrollY();
  const tilt = reduceMotion ? 0 : scrollY;

  return (
    <section className="relative min-h-screen overflow-hidden bg-ink pt-[90px]" style={{ display: "flex", alignItems: "center" }}>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ transform: reduceMotion ? "none" : `scale(1.08) translateY(${tilt * -0.08}px)` }}
      >
        <Image
          src="/img/hero-facility.jpg"
          alt="Peniel Industry PLC facility exterior with entrance arch, Bole Lemi Industrial Park"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: isMdUp ? "68% 35%" : "30% 45%" }}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(rgba(9,13,20,0.52), rgba(9,13,20,0.52)), linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 35%), linear-gradient(100deg, rgba(6,9,14,0.3) 0%, transparent 48%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-10">
        <div className="max-w-xl">
          <Reveal>
            <h1 className="mb-5 text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold leading-[1.08] tracking-tight text-white [text-shadow:0_4px_24px_rgba(0,0,0,0.25)]">
              Precision manufacturing for Ethiopia&apos;s beverage industry
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-white/94 [text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">
              {COMPANY.legalName} manufactures premium-quality crown corks for breweries, soft drink
              producers, and bottled water companies across Ethiopia — built on advanced manufacturing
              technology and strict quality standards.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="flex flex-wrap gap-3.5">
              <PrimaryButton href="/products" className="!bg-white !text-orange-deep !shadow-[0_12px_24px_rgba(0,0,0,0.25)]">
                Explore Our Products
              </PrimaryButton>
              <GhostButton light href="/contact" showArrow={false}>
                Request a Quote
              </GhostButton>
            </div>
          </Reveal>
        </div>
      </div>

      <a
        href="#factory"
        aria-label="Scroll to next section"
        className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-white/85"
        style={{ animation: reduceMotion ? "none" : "bob 2.2s ease-in-out infinite" }}
      >
        <span className="font-brandmono text-[10px] tracking-[0.15em]">SCROLL</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </a>
    </section>
  );
}

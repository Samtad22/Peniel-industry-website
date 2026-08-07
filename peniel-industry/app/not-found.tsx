import type { Metadata } from "next";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import CrownCapSVG from "@/components/ui/CrownCapSVG";
import { PrimaryButton, GhostButton } from "@/components/ui/Buttons";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <section className="flex min-h-[80vh] items-center bg-navy px-6 py-32">
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 md:grid-cols-2">
        <Reveal className="order-2 flex justify-center md:order-1">
          <CrownCapSVG size={260} />
        </Reveal>
        <div className="order-1 text-center md:order-2 md:text-left">
          <Reveal>
            <Eyebrow tone="onDark">404</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mb-4 text-[clamp(1.8rem,3.6vw,2.6rem)] font-extrabold leading-tight text-white">
              This page doesn&apos;t exist
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mb-8 max-w-sm text-[16px] leading-relaxed text-white/70 md:mx-0">
              The page you&apos;re looking for may have been moved or doesn&apos;t exist. Here are
              a few places to try instead.
            </p>
          </Reveal>
          <Reveal delay={200} className="flex flex-wrap justify-center gap-3.5 md:justify-start">
            <PrimaryButton href="/">Back to Home</PrimaryButton>
            <GhostButton light href="/contact" showArrow={false}>
              Contact Us
            </GhostButton>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

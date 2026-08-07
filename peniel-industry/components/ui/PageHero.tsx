import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import ScallopDivider from "@/components/ui/ScallopDivider";

export default function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <section className="bg-navy pt-36 pb-16 md:pt-40 md:pb-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <Reveal>
            <Eyebrow tone="onDark">{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mb-5 text-[clamp(2rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">
              {title}
            </h1>
          </Reveal>
          {intro && (
            <Reveal delay={140}>
              <p className="mx-auto max-w-2xl text-[17px] leading-relaxed text-white/75">{intro}</p>
            </Reveal>
          )}
          {children && (
            <Reveal delay={200} className="mt-8">
              {children}
            </Reveal>
          )}
        </div>
      </section>
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-orange)" />
    </>
  );
}

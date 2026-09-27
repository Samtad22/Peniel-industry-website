import Link from "next/link";
import OpsHeader from "./OpsHeader";

/**
 * Placeholder for an area scheduled in a later build phase, as an ink poster
 * in the v2 look (the design's "Maintenance: placeholder for later", 1r).
 */
export default function OpsPlanned({
  title,
  phase,
  children,
  link,
}: {
  title: string;
  /** Build phase from docs/PORTAL_SPEC.md; omit for areas not yet scheduled. */
  phase?: number;
  children: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <>
      <OpsHeader title={title} />
      <div className="bg-text px-4 py-12 text-bg sm:px-8 sm:py-16">
        <div className="flex max-w-[760px] flex-col gap-4">
          <span className="font-mono text-[11px] font-semibold tracking-[.1em] text-accent">{phase ? `PLANNED · PHASE ${phase}` : "PLANNED"}</span>
          <h2 className="m-0 text-balance text-[40px] leading-[.95] tracking-[-.04em] text-bg sm:text-[64px]">
            {title} is coming in {phase ? `Phase ${phase}` : "a later phase"}.
          </h2>
          <p className="m-0 max-w-[620px] text-[15px] opacity-80">{children}</p>
          {link && (
            <Link href={link.href} className="btn btn-split w-full bg-bg px-4 py-3.5 !text-text hover:bg-neutral-200 sm:w-[260px]">
              {link.label}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

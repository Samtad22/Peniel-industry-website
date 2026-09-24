import Link from "next/link";
import OpsHeader from "./OpsHeader";

/**
 * Placeholder for an area scheduled in a later build phase — styled after the
 * design's "Maintenance: placeholder for later" screen (1r).
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
      <div className="flex max-w-[640px] flex-col gap-3 px-4 py-14 sm:px-8">
        <span className="tag tag-outline self-start">{phase ? `Planned · Phase ${phase}` : "Planned"}</span>
        <h3 className="m-0">
          {title} is coming in {phase ? `Phase ${phase}` : "a later phase"}.
        </h3>
        <p className="m-0 text-[15px]">{children}</p>
        {link && (
          <Link href={link.href} className="btn btn-secondary btn-split w-[220px] text-text">
            {link.label}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </>
  );
}

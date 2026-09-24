import Link from "next/link";

/** Page heading used on customer screens (h6 section kicker + 48px title). */
export function CustomerPageHead({
  section,
  title,
  aside,
}: {
  section: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 border-b-2 border-divider px-4 py-7 sm:px-10">
      <div className="min-w-0 flex-1">
        <h6 className="mb-2 mt-0 text-accent">{section}</h6>
        <h1 className="m-0 text-[36px] sm:text-[48px]">{title}</h1>
      </div>
      {aside}
    </div>
  );
}

/** Placeholder for a customer area scheduled in a later build phase. */
export default function CustomerPlanned({
  section,
  title,
  phase,
  children,
}: {
  section: string;
  title: string;
  phase: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <CustomerPageHead section={section} title={title} />
      <div className="flex max-w-[720px] flex-col gap-4 px-4 pb-16 pt-12 sm:px-10">
        <span className="tag tag-outline self-start">Coming soon</span>
        <p className="m-0 text-[17px]">{children}</p>
        <p className="m-0 text-[13px] opacity-60">Planned for build phase {phase}.</p>
        <Link href="/orders" className="btn btn-secondary btn-split w-[200px] text-text">
          Back to orders<span aria-hidden="true">→</span>
        </Link>
      </div>
    </>
  );
}

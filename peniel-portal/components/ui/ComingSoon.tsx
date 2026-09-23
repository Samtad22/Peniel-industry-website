import PageHeader from "./PageHeader";

/** Placeholder for sections scheduled in a later build phase (docs/PORTAL_SPEC.md §5). */
export default function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-xl border border-dashed border-steel bg-white p-8 text-sm text-muted">
        <p className="font-medium text-ink">Coming in Phase {phase}.</p>
        {children && <p className="mt-1">{children}</p>}
      </div>
    </>
  );
}

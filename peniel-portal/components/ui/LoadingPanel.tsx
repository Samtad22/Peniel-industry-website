/** Placeholder while a portal page loads (no spinner, just the page shape). */
export default function LoadingPanel() {
  return (
    <div className="flex animate-pulse flex-col gap-5 px-5 py-8 sm:px-8" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-2/5 max-w-[320px] bg-neutral-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-neutral-200/70" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 bg-neutral-200/50" />
        ))}
      </div>
    </div>
  );
}

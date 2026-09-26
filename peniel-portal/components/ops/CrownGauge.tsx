/**
 * The control room's line gauge: a 21-flute crown (alternating wedges) with a
 * ring that fills to `pct`, and the figure in the middle. Red when `down`.
 */
export default function CrownGauge({ pct, value, unit, down }: { pct: number; value: string; unit: string; down?: boolean }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="img"
      aria-label={`${value} ${unit}`}
      className="grid size-[140px] shrink-0 place-items-center rounded-full sm:size-[164px]"
      style={{
        background: down
          ? "repeating-conic-gradient(var(--color-accent-800) 0 8.57deg, var(--color-accent-600) 8.57deg 17.14deg)"
          : "repeating-conic-gradient(var(--color-neutral-600) 0 8.57deg, var(--color-neutral-800) 8.57deg 17.14deg)",
      }}
    >
      <div
        className="grid size-[120px] place-items-center rounded-full sm:size-[142px]"
        style={{
          background: `conic-gradient(${down ? "var(--color-text)" : "var(--color-bg)"} 0 ${p}%, ${down ? "var(--color-accent-700)" : "var(--color-neutral-700)"} ${p}% 100%)`,
        }}
      >
        <div className={`flex size-[98px] flex-col items-center justify-center gap-0.5 rounded-full sm:size-[116px] ${down ? "bg-accent" : "bg-text"}`}>
          <span className="text-[26px] font-extrabold leading-none tracking-[-.03em] sm:text-[30px]">{value}</span>
          <span className="text-[11px] opacity-70">{unit}</span>
        </div>
      </div>
    </div>
  );
}

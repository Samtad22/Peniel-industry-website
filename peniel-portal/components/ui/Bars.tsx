import clsx from "clsx";

export type Bar = {
  /** Tooltip / accessible text, e.g. "23 Sep · 412K". */
  label: string;
  value: number;
  /** Draw in the accent colour (today, or over a limit). */
  hot?: boolean;
  /** Draw muted (e.g. not yet published). */
  muted?: boolean;
};

/**
 * Single-series bar chart in the design's style: ink bars on a 2px ink
 * baseline, the highlighted bar in the accent colour, an optional dashed
 * limit line. Each bar has a hover tooltip; the chart is summarised for
 * screen readers by `title`.
 */
export default function Bars({
  bars,
  max,
  height = 180,
  title,
  limit,
  start,
  end,
  gap = 6,
}: {
  bars: Bar[];
  max?: number;
  height?: number;
  title: string;
  limit?: { value: number; label: string };
  start?: string;
  end?: string;
  gap?: number;
}) {
  const top = Math.max(max ?? 0, limit?.value ?? 0, ...bars.map((b) => b.value)) || 1;
  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={title}
        className="relative flex items-end border-b-2 border-text"
        style={{ height, gap }}
      >
        {limit && (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-accent"
              style={{ bottom: `${(limit.value / top) * 100}%` }}
            />
            <span
              className="pointer-events-none absolute right-0 z-10 bg-bg px-1 text-[11px] text-accent-700"
              style={{ bottom: `calc(${(limit.value / top) * 100}% + 4px)` }}
            >
              {limit.label}
            </span>
          </>
        )}
        {bars.map((b, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" title={b.label}>
            <div
              className={clsx(
                "w-full",
                b.value === 0 ? "bg-neutral-300" : b.hot ? "bg-accent" : b.muted ? "bg-neutral-400" : "bg-text",
              )}
              style={{ height: `${Math.max((b.value / top) * 100, 2)}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-text px-1.5 py-0.5 text-[11px] text-bg group-hover:block">
              {b.label}
            </span>
          </div>
        ))}
      </div>
      {(start || end) && (
        <figcaption className={clsx("mt-1.5 flex text-[11px] opacity-60", start && end ? "justify-between" : "justify-end")}>
          {start && <span>{start}</span>}
          {end && <span>{end}</span>}
        </figcaption>
      )}
    </figure>
  );
}

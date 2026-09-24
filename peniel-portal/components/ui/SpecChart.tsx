/**
 * Measurements against spec limits (design 1i "Crown height · SPC"): a thin
 * ink line through the points, dashed accent lines at the limits. Points are
 * HTML dots so they stay round and carry a hover tooltip. Staff only.
 */
export default function SpecChart({
  points,
  min,
  max,
  target,
  height = 180,
  title,
  unit,
}: {
  points: { label: string; value: number }[];
  min: number;
  max: number;
  target: number;
  height?: number;
  title: string;
  unit: string;
}) {
  const span = max - min;
  const lo = min - span * 0.25;
  const hi = max + span * 0.25;
  const y = (v: number) => ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * 100;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);

  const limit = (v: number, label: string, dashed: boolean) => (
    <>
      <div className={`absolute inset-x-0 ${dashed ? "border-t-2 border-dashed border-accent" : "border-t border-divider"}`} style={{ top: `${y(v)}%` }} />
      <span className={`absolute right-1 text-[11px] ${dashed ? "text-accent-700" : "opacity-60"}`} style={{ top: `calc(${y(v)}% - 17px)` }}>
        {label}
      </span>
    </>
  );

  return (
    <div role="img" aria-label={title} className="relative border-b-2 border-l-2 border-text" style={{ height }}>
      {limit(max, `USL ${max.toFixed(2)}`, true)}
      {limit(target, target.toFixed(2), false)}
      {limit(min, `LSL ${min.toFixed(2)}`, true)}
      {points.length > 1 && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {points.map((p, i) => {
        const out = p.value < min || p.value > max;
        return (
          <span
            key={i}
            title={`${p.label} · ${p.value} ${unit}`}
            className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-bg ${out ? "bg-accent" : "bg-text"}`}
            style={{ left: `${x(i)}%`, top: `${y(p.value)}%` }}
          />
        );
      })}
      {points.length === 0 && <span className="absolute inset-0 grid place-items-center text-[13px] opacity-60">No measurements yet</span>}
    </div>
  );
}

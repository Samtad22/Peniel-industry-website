"use client";

import { useMediaQuery, useScrollY } from "@/lib/hooks";

/**
 * Real icon geometry, rebuilt as SVG (rather than a flat raster of the logo)
 * so the gear half can rotate independently of the static signal rings on
 * scroll. See conversation history: a flat raster can't cleanly animate just
 * part of itself, since the un-rendered "back" of the gear doesn't exist as
 * pixel data.
 */
export default function LogoMark({
  size = 32,
  gearColor = "var(--color-navy)",
  ringColor = "var(--color-orange)",
  spin = true,
}: {
  size?: number;
  gearColor?: string;
  ringColor?: string;
  /** When false, renders static (e.g. in the footer). */
  spin?: boolean;
}) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const scrollY = useScrollY();
  const rotation = spin ? scrollY * 0.5 : 0;

  const cx = 50, cy = 50;
  const teeth = 10;
  const rRoot = 30, rTip = 40;
  const toothFrac = 0.5;

  const pts: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const slot = (Math.PI * 2) / teeth;
    const a0 = i * slot;
    const a1 = a0 + (slot * (1 - toothFrac)) / 2;
    const a2 = a0 + slot * (1 - (1 - toothFrac) / 2);
    pts.push([cx + Math.cos(a0) * rRoot, cy + Math.sin(a0) * rRoot]);
    pts.push([cx + Math.cos(a1) * rRoot, cy + Math.sin(a1) * rRoot]);
    pts.push([cx + Math.cos(a1) * rTip, cy + Math.sin(a1) * rTip]);
    pts.push([cx + Math.cos(a2) * rTip, cy + Math.sin(a2) * rTip]);
    pts.push([cx + Math.cos(a2) * rRoot, cy + Math.sin(a2) * rRoot]);
  }
  const gearPath = `M ${pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" L ")} Z`;
  const rings = [12, 19, 26, 33];

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <clipPath id={`lm-circle-${size}`}><circle cx={cx} cy={cy} r={47} /></clipPath>
        <clipPath id={`lm-right-${size}`}><rect x={cx} y="0" width="50" height="100" /></clipPath>
        <clipPath id={`lm-left-${size}`}><rect x="0" y="0" width={cx} height="100" /></clipPath>
      </defs>
      <g clipPath={`url(#lm-circle-${size})`}>
        <g clipPath={`url(#lm-right-${size})`}>
          <g transform={!spin || reduceMotion ? undefined : `rotate(${rotation} 50 50)`}>
            <path d={gearPath} fill={gearColor} />
          </g>
        </g>
        <g clipPath={`url(#lm-left-${size})`}>
          {rings.map((r) => (
            <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={ringColor} strokeWidth={4} />
          ))}
        </g>
      </g>
    </svg>
  );
}

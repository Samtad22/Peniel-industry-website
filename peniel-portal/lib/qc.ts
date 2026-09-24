// QC measurements recorded on each inspection. INTERNAL: these values and
// specs never reach a customer (CLAUDE.md rule 2) — customers see only the
// reject rate, defects by type, and released / held.
//
// Specs are the ones shown in the design; confirm them with Quality.

export type Measure = {
  key: string;
  label: string;
  unit: string;
  spec: string;
  min?: number;
  max?: number;
};

export const MEASURES: Measure[] = [
  { key: "crown_height_mm", label: "Crown height", unit: "mm", spec: "6.00 ± 0.15", min: 5.85, max: 6.15 },
  { key: "outer_diameter_mm", label: "Outer diameter", unit: "mm", spec: "32.10 ± 0.20", min: 31.9, max: 32.3 },
  { key: "removal_torque", label: "Removal torque", unit: "lbf·in", spec: "≥ 12.0", min: 12 },
  { key: "liner_weight_mg", label: "Liner weight", unit: "mg", spec: "205 ± 10", min: 195, max: 215 },
  { key: "pressure_bar", label: "Leak / pressure test", unit: "bar", spec: "≥ 10.0", min: 10 },
];

export const CROWN_HEIGHT = MEASURES[0];

/** A measurement as one number: older records hold a list of readings (use the mean). */
export function measureValue(measurements: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = measurements?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) {
    const nums = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return nums.length ? Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 1000) / 1000 : null;
  }
  return null;
}

export function checkMeasure(m: Measure, value: number | null): "ok" | "low" | "high" | null {
  if (value == null) return null;
  if (m.min != null && value < m.min) return "low";
  if (m.max != null && value > m.max) return "high";
  return "ok";
}

/** True when the last `n` values keep rising (a simple SPC trend warning). */
export function risingTrend(values: number[], n = 7): boolean {
  if (values.length < n) return false;
  const tail = values.slice(-n);
  return tail.every((v, i) => i === 0 || v > tail[i - 1]);
}

/** Badge for a QC result (design pill styles). */
export const RESULT_PILL = {
  released: { label: "Released", style: { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" } },
  on_hold: { label: "❚❚ Held", style: { background: "var(--color-accent-800)", color: "var(--color-bg)" } },
  none: { label: "Not decided", style: { borderColor: "var(--color-neutral-600)", color: "var(--color-neutral-700)" } },
} as const;

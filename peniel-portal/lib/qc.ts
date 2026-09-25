// QC measurements recorded on each inspection. INTERNAL: these values and
// specs never reach a customer (CLAUDE.md rule 2) — customers see only the
// reject rate, defects by type, and released / held.
//
// Parameters, standards and sample sizes are the measured items (1–11) of
// the Certificate of Analysis, PIC-OF-053 revision 006. Items 12–24 (visual
// checks, standard 0%) are the defect types in the database.

export type Measure = {
  key: string;
  label: string;
  unit: string;
  /** The standard as written on the CoA. */
  spec: string;
  min?: number;
  max?: number;
  /** Crowns (or tests) per the CoA. */
  sample: string;
  /** Earlier keys for the same measurement, so older inspections still read. */
  aliases?: string[];
};

export const COA_DOCUMENT = "PIC-OF-053 rev. 006";

export const MEASURES: Measure[] = [
  { key: "shell_height_mm", label: "Shell height", unit: "mm", spec: "6 ± 0.15", min: 5.85, max: 6.15, sample: "50", aliases: ["crown_height_mm"] },
  { key: "shell_angle_deg", label: "Shell angle", unit: "°", spec: "24 ± 8", min: 16, max: 32, sample: "50" },
  { key: "shell_outside_diameter_mm", label: "Shell outside diameter", unit: "mm", spec: "32.1 ± 0.2", min: 31.9, max: 32.3, sample: "50", aliases: ["outer_diameter_mm"] },
  { key: "shell_internal_diameter_mm", label: "Shell internal diameter", unit: "mm", spec: "26.75 – 26.78", min: 26.75, max: 26.78, sample: "50" },
  { key: "shell_metal_thickness_mm", label: "Shell metal thickness", unit: "mm", spec: "0.21 – 0.23", min: 0.21, max: 0.23, sample: "15" },
  { key: "shell_metal_hardness_hr30t", label: "Shell metal hardness", unit: "HR30T", spec: "60 ± 4", min: 56, max: 64, sample: "15" },
  { key: "crown_weight_g", label: "Crown cork weight", unit: "g", spec: "2.0 ± 0.5", min: 1.5, max: 2.5, sample: "15" },
  { key: "liner_weight_mg", label: "Liner weight", unit: "mg", spec: "190 ± 30", min: 160, max: 220, sample: "15" },
  { key: "leaking_pressure_kgcm2", label: "Leaking pressure", unit: "kg/cm²", spec: "≥ 8", min: 8, sample: "50", aliases: ["pressure_bar"] },
  { key: "release_performance_kgcm2", label: "Release performance", unit: "kg/cm²", spec: "≥ 10.35", min: 10.35, sample: "25" },
  { key: "scratch_dust_mg", label: "Scratch resistance (dust)", unit: "mg", spec: "≤ 25", max: 25, sample: "2 × 25" },
];

export const CROWN_HEIGHT = MEASURES[0];
export const LEAK_PRESSURE = MEASURES[8];

/** Sample size for the visual checks on the CoA (corrosion is checked on 20). */
export const VISUAL_SAMPLE = 100;
export const DEFECT_SAMPLE: Record<string, number> = { corrosion: 20 };

/**
 * A measurement as one number: older records hold a list of readings (use
 * the mean) or an earlier key for the same measure.
 */
export function measureValue(measurements: Record<string, unknown> | null | undefined, key: string): number | null {
  const m = MEASURES.find((x) => x.key === key);
  for (const k of [key, ...(m?.aliases ?? [])]) {
    const v = measurements?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (Array.isArray(v)) {
      const nums = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      if (nums.length) return Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 1000) / 1000;
    }
  }
  return null;
}

export function checkMeasure(m: Measure, value: number | null): "ok" | "low" | "high" | null {
  if (value == null) return null;
  if (m.min != null && value < m.min) return "low";
  if (m.max != null && value > m.max) return "high";
  return "ok";
}

/** Everything that keeps a batch from conforming to the CoA: out-of-spec measures and any visual defect. */
export function coaFindings(
  measurements: Record<string, unknown> | null | undefined,
  defects: Record<string, number>,
  labels: Map<string, string>,
): string[] {
  const out: string[] = [];
  for (const m of MEASURES) {
    const c = checkMeasure(m, measureValue(measurements, m.key));
    if (c && c !== "ok") out.push(`${m.label} ${c === "low" ? "below" : "above"} ${m.spec} ${m.unit}`);
  }
  for (const [code, n] of Object.entries(defects)) if (n > 0) out.push(`${labels.get(code) ?? code}: ${n} found (standard 0%)`);
  return out;
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

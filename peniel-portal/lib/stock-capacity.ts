// What the raw material in stock can make, and how long it lasts: for each
// material with a usage rate, the crowns its stock makes (lib/calculator.ts),
// the material that runs out first (it stops production), and the days until
// its reorder level and until it is gone, at the plant's pace. No imports
// beyond the calculator: shared by the dashboard and the unit tests.
import { needFor, yieldOfMaterial, type Basis, type Plant } from "./calculator.ts";

export type CapacityMaterial = {
  id: string;
  name: string;
  unit: string;
  on_hand: number;
  reorder_level: number | null;
  use_basis: string | null;
  use_rate: number | null;
  /** Used in the last `usageDays` days (automatic use, in its unit), if known. */
  used_recently?: number;
};

/** Which crowns a material goes into: all of them, or only brands with that base coat. */
export type CapacityScope = "all" | "white_base_coat" | "transparent_base_coat" | "base_coat";

export type CapacityRow = {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  reorderLevel: number | null;
  scope: CapacityScope;
  /** Crowns the stock makes. */
  crowns: number;
  /** Used a day (its unit): from its own recent use, else from the pace. Null: no estimate. */
  perDay: number | null;
  /** Where perDay comes from. */
  perDayFrom: "use" | "pace" | null;
  /** Days until the reorder level (0 = at or below it) and until it runs out. Null: no estimate. */
  daysToReorder: number | null;
  daysToEmpty: number | null;
};

export type Capacity = {
  /** Materials that go into every crown, fewest crowns first. */
  rows: CapacityRow[];
  /** Base coats: only for brands with that coat. */
  coatRows: CapacityRow[];
  /** The material that runs out first, and the crowns stock makes (all materials together). */
  bottleneck: CapacityRow | null;
  /** On the list, but without a usage rate: not counted. */
  noRate: { id: string; name: string }[];
};

const SCOPE: Record<string, CapacityScope> = {
  white_base_coat_sheet: "white_base_coat",
  transparent_base_coat_sheet: "transparent_base_coat",
  base_coat_sheet: "base_coat",
};

/**
 * `pace`: crowns made a day, the plant's plan (null or 0: none); `usageDays`:
 * the days `used_recently` covers. Materials in every crown last at the pace;
 * a base coat (only some brands) at its own recent use. A material's own use
 * also stands in when there is no pace.
 */
export function stockCapacity(materials: CapacityMaterial[], plant: Plant, pace: number | null, usageDays = 30): Capacity {
  const rows: CapacityRow[] = [];
  const coatRows: CapacityRow[] = [];
  const noRate: Capacity["noRate"] = [];
  for (const m of materials) {
    const rate = Number(m.use_rate ?? 0);
    if (!m.use_basis || !(rate > 0)) {
      noRate.push({ id: m.id, name: m.name });
      continue;
    }
    const basis = m.use_basis as Basis;
    const onHand = Math.max(0, Number(m.on_hand));
    const y = yieldOfMaterial(onHand, basis, rate, plant);
    if (!y) {
      noRate.push({ id: m.id, name: m.name });
      continue;
    }
    const scope = SCOPE[m.use_basis] ?? "all";
    const used = Number(m.used_recently ?? 0);
    let perDay: number | null = null;
    let perDayFrom: CapacityRow["perDayFrom"] = null;
    if (scope === "all" && pace && pace > 0) {
      perDay = needFor(pace, basis, rate, plant);
      perDayFrom = "pace";
    } else if (used > 0 && usageDays > 0) {
      // Base coats go on some brands only: the overall pace would overstate their use.
      perDay = used / usageDays;
      perDayFrom = "use";
    }
    const reorder = m.reorder_level == null ? null : Number(m.reorder_level);
    const row: CapacityRow = {
      id: m.id,
      name: m.name,
      unit: m.unit,
      onHand: Number(m.on_hand),
      reorderLevel: reorder,
      scope,
      crowns: y.crowns,
      perDay,
      perDayFrom,
      daysToEmpty: perDay && perDay > 0 ? onHand / perDay : null,
      daysToReorder: perDay && perDay > 0 && reorder != null ? Math.max(0, (onHand - reorder) / perDay) : null,
    };
    (scope === "all" ? rows : coatRows).push(row);
  }
  rows.sort((a, b) => a.crowns - b.crowns);
  coatRows.sort((a, b) => a.crowns - b.crowns);
  return { rows, coatRows, bottleneck: rows[0] ?? null, noRate };
}

/** 0.4 → "today", 12.3 → "12 days", 95 → "about 3 months". */
export function daysLabel(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return "-";
  if (days < 1) return "today";
  if (days < 60) return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `about ${months} months`;
  return `about ${Math.round(days / 365)} years`;
}

/** The date `days` from `todayIso` (YYYY-MM-DD), or null. */
export function dateIn(todayIso: string, days: number | null): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  const d = new Date(`${todayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString().slice(0, 10);
}

/**
 * The materials the dashboard shows, in this order: the main ones that go
 * into a crown. Each is found on the list by its usual names.
 */
export const DASHBOARD_MATERIALS: { key: string; label: string; names: string[]; prefix?: string[] }[] = [
  { key: "varnish", label: "Varnish", names: ["varnish", "overprintvarnish", "varnish801"] },
  { key: "lacquer", label: "Lacquer", names: ["adhesivelacquer", "lacquer", "adhesivelacquer606"] },
  { key: "transparent", label: "Transparent base coat", names: ["transparentbasecoat", "basecoattransparent", "tbc"] },
  { key: "white", label: "White base coat", names: ["whitebasecoat", "basecoatwhite", "wbc"] },
  { key: "pvc", label: "PVC-free liner compound", names: ["pvcfreelinercompound", "pvcfreecompound", "pvcfree", "linercompound"] },
  { key: "tinplate", label: "Tinplate", names: ["tinplate", "tinfreesteelsheet"], prefix: ["tinplate"] },
  { key: "polybag", label: "Polybag", names: ["polybag", "polybags"] },
  { key: "box", label: "Box", names: ["box", "boxes", "carton", "cartons"] },
];

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The dashboard's materials from the list: for each, the one on the list by
 * that name (one with a usage rate first, then the most in stock). `missing`:
 * those not on the list at all.
 */
export function pickDashboardMaterials<T extends CapacityMaterial>(materials: T[]): { picked: T[]; missing: string[] } {
  const picked: T[] = [];
  const missing: string[] = [];
  for (const d of DASHBOARD_MATERIALS) {
    const matches = materials.filter((m) => {
      const p = plain(m.name);
      return d.names.includes(p) || (d.prefix ?? []).some((x) => p.startsWith(x));
    });
    const best = matches.sort((a, b) => Number(Number(b.use_rate ?? 0) > 0) - Number(Number(a.use_rate ?? 0) > 0) || Number(b.on_hand) - Number(a.on_hand))[0];
    if (best) picked.push(best);
    else missing.push(d.label);
  }
  return { picked, missing };
}

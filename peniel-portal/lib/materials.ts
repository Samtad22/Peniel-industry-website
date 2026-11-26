// Raw materials used automatically as work is logged
// (supabase/migrations/20261016000001_plant_links.sql). Each material can have
// one usage rate on one basis; logging sheets, oven passes and production
// entries then records the material used. Internal only. No imports.

export type UseBasis =
  | "sheet_in"
  | "sheet_printed"
  | "base_coat_sheet"
  | "white_base_coat_sheet"
  | "transparent_base_coat_sheet"
  | "varnish_sheet"
  | "lacquer_sheet"
  | "oven_pass"
  | "thousand_crowns"
  | "box";

export const USE_BASIS: Record<UseBasis, { label: string; per: string }> = {
  sheet_in: { label: "Per sheet into the line (e.g. tinplate)", per: "sheet into the line" },
  sheet_printed: { label: "Per sheet printed", per: "sheet printed" },
  white_base_coat_sheet: { label: "Per sheet given the WHITE base coat (e.g. white base coat)", per: "sheet white base-coated" },
  transparent_base_coat_sheet: { label: "Per sheet given the TRANSPARENT base coat (e.g. transparent base coat)", per: "sheet transparent base-coated" },
  base_coat_sheet: { label: "Per sheet base-coated, white or transparent (used on both)", per: "sheet base-coated" },
  varnish_sheet: { label: "Per sheet varnished (e.g. varnish)", per: "sheet varnished" },
  lacquer_sheet: { label: "Per sheet lacquered (e.g. lacquer)", per: "sheet lacquered" },
  oven_pass: { label: "Per pass through the big oven (e.g. LPG)", per: "oven pass" },
  thousand_crowns: { label: "Per 1,000 crowns off the presses (e.g. liner compound)", per: "1,000 crowns" },
  box: { label: "Per box of 10,000 good crowns packed (e.g. boxes, polybags)", per: "box of 10,000 crowns" },
};

/** The rate with its wastage allowance: rate x (1 + wastage %). Null when there is no rate. */
export function effectiveRate(rate: number | string | null | undefined, wastePct: number | string | null | undefined): number | null {
  const r = rate == null ? 0 : Number(rate);
  if (!(r > 0)) return rate == null ? null : r;
  const w = Math.min(100, Math.max(0, Number(wastePct ?? 0) || 0));
  return Math.round(r * (1 + w / 100) * 1e9) / 1e9;
}

/** "Uses 0.173 kg per 1,000 crowns + 10% wastage", or null when not tracked automatically. */
export function describeUse(m: { unit: string; use_basis: string | null; use_rate: number | string | null; waste_pct?: number | string | null }): string | null {
  const rate = m.use_rate == null ? 0 : Number(m.use_rate);
  if (!m.use_basis || !(m.use_basis in USE_BASIS) || !(rate > 0)) return null;
  const waste = Number(m.waste_pct ?? 0) || 0;
  return `Uses ${rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${m.unit} per ${USE_BASIS[m.use_basis as UseBasis].per}${waste > 0 ? ` + ${waste.toLocaleString("en-US", { maximumFractionDigits: 2 })}% wastage` : ""}`;
}

/** A wastage % typed by staff: 0 to 100; empty is 0. NaN when it isn't. */
export function parseWastePct(raw: string): number {
  const s = raw.trim().replace(",", ".").replace(/%$/, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

/** A usage rate typed by staff: a positive number, or null to stop tracking. */
export function parseRate(raw: string): number | null | typeof NaN {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : NaN;
}

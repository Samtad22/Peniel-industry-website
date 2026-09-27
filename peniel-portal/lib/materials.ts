// Raw materials used automatically as work is logged
// (supabase/migrations/20261016000001_plant_links.sql). Each material can have
// one usage rate on one basis; logging sheets, oven passes and production
// entries then records the material used. Internal only. No imports.

export type UseBasis = "sheet_in" | "sheet_printed" | "base_coat_sheet" | "varnish_sheet" | "lacquer_sheet" | "oven_pass" | "thousand_crowns";

export const USE_BASIS: Record<UseBasis, { label: string; per: string }> = {
  sheet_in: { label: "Per sheet into the line (e.g. tinplate)", per: "sheet into the line" },
  sheet_printed: { label: "Per sheet printed (e.g. printing ink)", per: "sheet printed" },
  base_coat_sheet: { label: "Per sheet base-coated (white / transparent coat)", per: "sheet base-coated" },
  varnish_sheet: { label: "Per sheet varnished", per: "sheet varnished" },
  lacquer_sheet: { label: "Per sheet lacquered", per: "sheet lacquered" },
  oven_pass: { label: "Per pass through the big oven (e.g. LPG)", per: "oven pass" },
  thousand_crowns: { label: "Per 1,000 crowns off the presses (e.g. liner compound)", per: "1,000 crowns" },
};

/** "Uses 0.5 kg per 1,000 crowns", or null when not tracked automatically. */
export function describeUse(m: { unit: string; use_basis: string | null; use_rate: number | string | null }): string | null {
  const rate = m.use_rate == null ? 0 : Number(m.use_rate);
  if (!m.use_basis || !(m.use_basis in USE_BASIS) || !(rate > 0)) return null;
  return `Uses ${rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${m.unit} per ${USE_BASIS[m.use_basis as UseBasis].per}`;
}

/** A usage rate typed by staff: a positive number, or null to stop tracking. */
export function parseRate(raw: string): number | null | typeof NaN {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : NaN;
}

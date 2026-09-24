// Pure helpers for production and QC figures, shared by staff and customer
// pages (and unit-tested).

/** QC reject-rate limit shown on the QC screens (from the design; confirm with Quality). */
export const REJECT_LIMIT_PCT = 0.5;

export const SHIFTS = ["A", "B", "C"] as const;

/** `YYYY-MM-DD` plus `days`. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last `n` calendar days ending on `today`, oldest first. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/**
 * When the order should be finished at the recent pace: the average good
 * output of the last 7 days that had any output. Null when there is no pace
 * yet, or nothing left to make.
 */
export function projectCompletion(
  daily: { date: string; good: number }[],
  remaining: number,
  today: string,
): { date: string; perDay: number } | null {
  if (remaining <= 0) return null;
  const recent = daily
    .filter((d) => d.good > 0 && d.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);
  if (recent.length === 0) return null;
  const perDay = recent.reduce((s, d) => s + d.good, 0) / recent.length;
  return { date: addDays(today, Math.ceil(remaining / perDay)), perDay: Math.round(perDay) };
}

/** Reject rate in %, 2 decimals. */
export function rejectPct(rejects: number, produced: number): number {
  return produced > 0 ? Math.round((10000 * rejects) / produced) / 100 : 0;
}

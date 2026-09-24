// Display formats (CLAUDE.md): dates as `14 Oct 2026` in Africa/Addis_Ababa,
// crown quantities as `12.0M` / `850K`.

export const TIME_ZONE = "Africa/Addis_Ababa";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

function toDate(value: string | Date): Date {
  // A bare `YYYY-MM-DD` is a calendar date, not an instant: pin it to noon
  // UTC so it prints as the same day in Addis Ababa.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`);
  }
  return new Date(value);
}

/** `14 Oct 2026`. Returns "—" for empty values. */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  return dateFmt.format(toDate(value)).replace("Sept", "Sep");
}

/** `14 Oct 2026, 09:30` (Addis Ababa time). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = toDate(value);
  return `${formatDate(d)}, ${timeFmt.format(d)}`;
}

/** Crown quantities: `12.0M`, `850K`, `640`. */
export function formatQty(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 999_500) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

/** `1.25%` */
export function formatPct(value: number | string | null | undefined, digits = 2): string {
  if (value == null || value === "") return "—";
  return `${Number(value).toFixed(digits)}%`;
}

const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: TIME_ZONE });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TIME_ZONE });
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIME_ZONE });

/** `20 Nov` — short form used in tables. */
export function formatDayMonth(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  return dayMonthFmt.format(toDate(value)).replace("Sept", "Sep");
}

/** `Wed 23 Sep 2026 · 16:52 EAT` — the dashboard clock line. */
export function formatNowLine(now: Date): string {
  return `${weekdayFmt.format(now)} ${formatDate(now)} · ${timeFmt.format(now)} EAT`;
}

/** `Good morning` / `Good afternoon` / `Good evening`, by Addis Ababa time. */
export function greeting(now: Date): string {
  const h = Number(hourFmt.format(now)) % 24;
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** `12 min`, `2 h ago`, `3 d ago` — compact age of an event. */
export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - toDate(value).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Calendar date (`YYYY-MM-DD`) in Addis Ababa, `days` from `now`. */
export function addisDateISO(now: Date, days = 0): string {
  const d = new Date(now.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
}

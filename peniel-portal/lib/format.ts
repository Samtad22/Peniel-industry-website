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

// Settings admins change on Ops → Settings (portal_settings), merged over
// these defaults. Pure (no server imports): shared by the browser and server.

export type PlantSettings = {
  /** Camera reject rate above which it's flagged, in %. */
  reject_limit_pct: number;
  /** Minutes a stillage usually stays in the oven per pass. */
  oven_minutes: number;
  /** Sheets a stillage starts at on the forms (staff type the real count). */
  stillage_sheets: number;
};

export type CoaSettings = { company: string; documentNo: string; revision: string; tel: string; linerTypeId: string };

export type EmailGroup =
  | "customer_orders"
  | "customer_artwork"
  | "customer_documents"
  | "customer_messages"
  | "staff_orders"
  | "staff_artwork"
  | "staff_pickups"
  | "staff_messages"
  | "reports";

export type Settings = {
  emails_off: EmailGroup[];
  /** Staff user ids who get the end-of-day and monthly reports; empty = all admins. */
  report_recipients: string[];
  coa: CoaSettings;
  plant: PlantSettings;
};

export const DEFAULT_SETTINGS: Settings = {
  emails_off: [],
  report_recipients: [],
  coa: {
    company: "Peniel Industry Crown Cork Factory",
    documentNo: "PIC-OF-053",
    revision: "006",
    tel: "+251 11 668 9255 / +251 957 238 924",
    linerTypeId: "Contoform 0369",
  },
  plant: { reject_limit_pct: 0.5, oven_minutes: 30, stillage_sheets: 1_410 },
};

export const EMAIL_GROUPS: { key: EmailGroup; who: "Customer" | "Staff" | "Admins"; label: string }[] = [
  { key: "customer_orders", who: "Customer", label: "Order confirmed, on hold, not accepted, ready, dispatched, or a new due date" },
  { key: "customer_artwork", who: "Customer", label: "Proof to approve, physical proof on its way, their artwork reviewed" },
  { key: "customer_documents", who: "Customer", label: "New document shared, Certificate of Analysis ready" },
  { key: "customer_messages", who: "Customer", label: "New message from Peniel" },
  { key: "staff_orders", who: "Staff", label: "New order submitted, order cancelled by the customer (sales and admin)" },
  { key: "staff_artwork", who: "Staff", label: "Artwork from a customer, proof approved or changes requested (sales and admin)" },
  { key: "staff_pickups", who: "Staff", label: "Pickup requested (warehouse and admin)" },
  { key: "staff_messages", who: "Staff", label: "New customer message" },
  { key: "reports", who: "Admins", label: "End-of-day report every evening, monthly summary on the 1st" },
];

/** Which group an email kind (lib/notify.ts, notification_log.kind) belongs to; null = always sent (e.g. a test). */
export function emailGroupOf(kind: string): EmailGroup | null {
  if (kind === "order_submitted" || kind === "order_cancelled") return "staff_orders";
  if (kind.startsWith("order_")) return "customer_orders";
  if (kind === "proof_sent" || kind === "proof_dispatched" || kind.startsWith("artwork_accepted") || kind.startsWith("artwork_changes")) return "customer_artwork";
  if (kind === "document_shared" || kind === "certificate_ready") return "customer_documents";
  if (kind === "message_to_customer") return "customer_messages";
  if (kind === "artwork_submitted" || kind.startsWith("proof_approved") || kind.startsWith("proof_changes")) return "staff_artwork";
  if (kind === "pickup_requested") return "staff_pickups";
  if (kind === "message_to_staff") return "staff_messages";
  if (kind === "eod_report" || kind === "month_report") return "reports";
  return null;
}

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const str = (v: unknown, fallback: string, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);

/** Stored rows over the defaults; anything missing or out of range falls back. */
export function mergeSettings(rows: { key: string; value: unknown }[]): Settings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const groups = new Set(EMAIL_GROUPS.map((g) => g.key));
  const off = get("emails_off");
  const recips = get("report_recipients");
  const coa = (get("coa") ?? {}) as Record<string, unknown>;
  const plant = (get("plant") ?? {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    emails_off: Array.isArray(off) ? (off.filter((g) => groups.has(g as EmailGroup)) as EmailGroup[]) : [],
    report_recipients: Array.isArray(recips) ? recips.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [],
    coa: {
      company: str(coa.company, d.coa.company),
      documentNo: str(coa.documentNo, d.coa.documentNo, 40),
      revision: str(coa.revision, d.coa.revision, 20),
      tel: str(coa.tel, d.coa.tel),
      linerTypeId: str(coa.linerTypeId, d.coa.linerTypeId, 60),
    },
    plant: {
      reject_limit_pct: num(plant.reject_limit_pct, 0.01, 20, d.plant.reject_limit_pct),
      oven_minutes: Math.round(num(plant.oven_minutes, 1, 240, d.plant.oven_minutes)),
      stillage_sheets: Math.round(num(plant.stillage_sheets, 100, 3000, d.plant.stillage_sheets)),
    },
  };
}

// The admin activity log (Ops → Settings → Activity): every audited change in
// the portal, from audit_log, in plain words. Staff only (admin): it can quote
// internal notes and equipment names.

export type ActivityRow = {
  id: number;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

/** The tables the log covers, as the filter lists them. */
export const ACTIVITY_AREAS: { key: string; label: string; entities: string[] }[] = [
  { key: "orders", label: "Orders", entities: ["orders", "order_attachments"] },
  { key: "production", label: "Production", entities: ["production_entries", "print_runs", "stillage_passes"] },
  { key: "quality", label: "Quality", entities: ["qc_inspections", "sorting_records", "coa_signatures"] },
  { key: "stock", label: "Stock & pickups", entities: ["finished_stock", "pickup_bookings"] },
  { key: "artwork", label: "Artwork & documents", entities: ["artwork_versions", "proofs", "artwork_submissions", "brand_artwork_files", "documents"] },
  { key: "maintenance", label: "Maintenance", entities: ["machines", "maintenance_logs"] },
  { key: "customers", label: "Customers & users", entities: ["companies", "brands", "profiles"] },
  { key: "settings", label: "Settings", entities: ["portal_settings", "hold_reason_presets"] },
];

const THING: Record<string, string> = {
  orders: "Order",
  order_attachments: "Order file",
  production_entries: "Production entry",
  print_runs: "Stillage",
  stillage_passes: "Oven pass",
  qc_inspections: "Inspection",
  sorting_records: "Sorting report",
  coa_signatures: "Certificate signature",
  finished_stock: "Finished stock",
  pickup_bookings: "Pickup",
  artwork_versions: "Artwork version",
  proofs: "Proof",
  artwork_submissions: "Artwork from a customer",
  brand_artwork_files: "Artwork library file",
  documents: "Document",
  machines: "Machine",
  maintenance_logs: "Maintenance job",
  companies: "Customer",
  brands: "Brand",
  profiles: "User",
  portal_settings: "Setting",
  hold_reason_presets: "Reason preset",
};

const SETTING: Record<string, string> = {
  emails_off: "Emails on or off",
  report_recipients: "Report recipients",
  coa: "Certificate of Analysis details",
  plant: "Plant defaults",
};

/** Columns that change on every save and say nothing. */
const NOISE = new Set(["id", "updated_at", "created_at", "search", "fingerprint", "image", "coa_notified_fp"]);

const pretty = (k: string) => k.replace(/_/g, " ").replace(/\bqty\b/, "quantity").replace(/\bpct\b/, "%");

/** Names the record: an order number, a batch, a stillage, a name. */
export function activitySubject(r: Pick<ActivityRow, "entity" | "before" | "after">): string {
  const x = { ...(r.before ?? {}), ...(r.after ?? {}) };
  if (r.entity === "portal_settings") return SETTING[String(x.key)] ?? String(x.key ?? "");
  const pick = ["order_no", "batch_no", "stillage_no", "full_name", "name", "title", "file_name", "text", "signer_name", "description"].find(
    (k) => typeof x[k] === "string" && x[k],
  );
  const s = pick ? String(x[pick]) : "";
  const label = pick === "batch_no" ? `batch ${s}` : pick === "stillage_no" ? `stillage ${s}` : s;
  return label.length > 70 ? `${label.slice(0, 67)}...` : label;
}

/** The fields an update changed (not the noise). */
export function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  return changedValues(before, after).map((v) => v.field);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** One line of the log: "Inspection · batch 12" / "released" / "result, customer reason". */
export function describeActivity(r: ActivityRow): { thing: string; subject: string; what: string; detail: string } {
  const thing = THING[r.entity] ?? pretty(r.entity);
  const act = r.action;
  const what =
    act === "created" ? "added"
    : act === "deleted" ? "deleted"
    : act === "invited" ? "invited"
    : act === "hold" ? "put on hold"
    : act === "release" ? "released"
    : act === "result_cleared" ? "result cleared"
    : act === "publish" ? "published"
    : act === "unpublish" ? "unpublished"
    : act.startsWith("status:") ? `status → ${pretty(act.slice(7))}`
    : act.startsWith("visibility:") ? `visibility → ${act.slice(11)}`
    : act === "activated" || act === "deactivated" ? act
    : "changed";
  const changed = act === "updated" || act.startsWith("status:") ? changedFields(r.before, r.after).filter((f) => f !== "status") : [];
  return { thing, subject: activitySubject(r), what, detail: changed.length ? `Changed: ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ` and ${changed.length - 6} more` : ""}` : "" };
}

const show = (v: unknown): string => {
  if (v == null || v === "") return "empty";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
};

/** Each changed field with its old and new value, for the expanded row. */
export function changedValues(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { field: string; from: string; to: string }[] {
  if (!before || !after) return [];
  return Object.keys({ ...before, ...after })
    .filter((k) => !NOISE.has(k) && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .flatMap((k) =>
      // A setting's value is an object: show the keys inside it that changed.
      k === "value" && isObj(before[k]) && isObj(after[k])
        ? changedValues(before[k] as Record<string, unknown>, after[k] as Record<string, unknown>)
        : [{ field: pretty(k), from: show(before[k]), to: show(after[k]) }],
    );
}

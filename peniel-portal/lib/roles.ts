export type Role = "customer_user" | "admin" | "sales" | "production" | "quality" | "warehouse";
export type StaffRole = Exclude<Role, "customer_user">;

export const STAFF_ROLES: StaffRole[] = ["admin", "sales", "production", "quality", "warehouse"];

export const ROLE_LABELS: Record<Role, string> = {
  customer_user: "Customer",
  admin: "Admin",
  sales: "Sales & customer service",
  production: "Production",
  quality: "Quality",
  warehouse: "Warehouse",
};

export function isStaffRole(role: Role): role is StaffRole {
  return role !== "customer_user";
}

export type OpsArea =
  | "dashboard"
  | "inbox"
  | "orders"
  | "production"
  | "sheets"
  | "quality"
  | "inventory"
  | "artwork"
  | "documents"
  | "customers"
  | "messages"
  | "maintenance"
  | "settings";

/** Sidebar groups (OpsRail in the design): daily work, the plant, and records. */
export type OpsGroup = "work" | "plant" | "records";

/**
 * Staff navigation and who may open each area: the "Roles → nav" matrix in
 * the Peniel Ops design. Pages enforce this too, not just the menu. `no` is
 * the area's number in the top bar ("OPS / 03 · ORDERS"); listed in rail order.
 */
export const OPS_NAV: { area: OpsArea; href: string; label: string; short: string; no: string; group: OpsGroup; roles: StaffRole[] }[] = [
  { area: "dashboard", href: "/ops", label: "Dashboard", short: "Home", no: "01", group: "work", roles: STAFF_ROLES },
  { area: "inbox", href: "/ops/inbox", label: "Order inbox", short: "Inbox", no: "02", group: "work", roles: ["admin", "sales"] },
  { area: "orders", href: "/ops/orders", label: "Orders", short: "Orders", no: "03", group: "work", roles: STAFF_ROLES },
  { area: "messages", href: "/ops/messages", label: "Messages", short: "Messages", no: "10", group: "work", roles: ["admin", "sales"] },
  { area: "production", href: "/ops/production", label: "Production", short: "Production", no: "04", group: "plant", roles: ["admin", "production", "quality"] },
  { area: "sheets", href: "/ops/production/sheets", label: "Printed sheets", short: "Sheets", no: "04", group: "plant", roles: ["admin", "production", "quality"] },
  { area: "quality", href: "/ops/quality", label: "Quality control", short: "Quality", no: "05", group: "plant", roles: ["admin", "quality"] },
  { area: "inventory", href: "/ops/inventory", label: "Inventory", short: "Inventory", no: "06", group: "plant", roles: ["admin", "production", "warehouse"] },
  { area: "maintenance", href: "/ops/maintenance", label: "Maintenance", short: "Maint.", no: "11", group: "plant", roles: ["admin", "production"] },
  { area: "artwork", href: "/ops/artwork", label: "Artwork", short: "Artwork", no: "07", group: "records", roles: ["admin", "sales", "quality"] },
  { area: "documents", href: "/ops/documents", label: "Documents", short: "Docs", no: "08", group: "records", roles: ["admin", "sales", "quality", "warehouse"] },
  { area: "customers", href: "/ops/customers", label: "Customers", short: "Customers", no: "09", group: "records", roles: ["admin", "sales"] },
  { area: "settings", href: "/ops/settings", label: "Settings", short: "Settings", no: "12", group: "records", roles: ["admin"] },
];

/** The nav item a path belongs to: the longest matching href ("/ops/production/sheets" → Printed sheets). */
export function opsNavFor(pathname: string) {
  return OPS_NAV.filter((n) => (n.href === "/ops" ? pathname === "/ops" : pathname === n.href || pathname.startsWith(`${n.href}/`))).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

/** Roles allowed on an /ops area — pages enforce this, not just the menu. */
export function opsRolesFor(area: OpsArea): StaffRole[] {
  const item = OPS_NAV.find((n) => n.area === area);
  if (!item) throw new Error(`No OPS_NAV entry for ${area}`);
  return item.roles;
}

/** Customer portal navigation (PortalNav in the design). */
export const CUSTOMER_NAV: { href: string; label: string; area?: "orders" | "production" | "artwork" | "documents" | "messages" }[] = [
  { href: "/orders", label: "Orders", area: "orders" },
  { href: "/production", label: "Production", area: "production" },
  { href: "/catalog", label: "Catalog" },
  { href: "/artwork", label: "Artwork", area: "artwork" },
  { href: "/documents", label: "Documents", area: "documents" },
  { href: "/messages", label: "Messages", area: "messages" },
];

/** "Selam Haile" → "SH" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

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
  | "quality"
  | "inventory"
  | "artwork"
  | "documents"
  | "customers"
  | "messages"
  | "maintenance"
  | "settings";

/**
 * Staff navigation and who may open each area — the "Roles → nav" matrix in
 * the Peniel Ops design. Pages enforce this too, not just the menu.
 */
export const OPS_NAV: { area: OpsArea; href: string; label: string; roles: StaffRole[] }[] = [
  { area: "dashboard", href: "/ops", label: "Dashboard", roles: STAFF_ROLES },
  { area: "inbox", href: "/ops/inbox", label: "Order inbox", roles: ["admin", "sales"] },
  { area: "orders", href: "/ops/orders", label: "Orders", roles: STAFF_ROLES },
  { area: "production", href: "/ops/production", label: "Production", roles: ["admin", "production", "quality"] },
  { area: "quality", href: "/ops/quality", label: "Quality control", roles: ["admin", "quality"] },
  { area: "inventory", href: "/ops/inventory", label: "Inventory", roles: ["admin", "production", "warehouse"] },
  { area: "artwork", href: "/ops/artwork", label: "Artwork", roles: ["admin", "sales", "quality"] },
  { area: "documents", href: "/ops/documents", label: "Documents", roles: ["admin", "sales", "quality", "warehouse"] },
  { area: "customers", href: "/ops/customers", label: "Customers", roles: ["admin", "sales"] },
  { area: "messages", href: "/ops/messages", label: "Messages", roles: ["admin", "sales"] },
  { area: "maintenance", href: "/ops/maintenance", label: "Maintenance", roles: ["admin", "production"] },
  { area: "settings", href: "/ops/settings", label: "Settings", roles: ["admin"] },
];

/** Roles allowed on an /ops area — pages enforce this, not just the menu. */
export function opsRolesFor(area: OpsArea): StaffRole[] {
  const item = OPS_NAV.find((n) => n.area === area);
  if (!item) throw new Error(`No OPS_NAV entry for ${area}`);
  return item.roles;
}

/** Customer portal navigation (PortalNav in the design). */
export const CUSTOMER_NAV: { href: string; label: string }[] = [
  { href: "/orders", label: "Orders" },
  { href: "/production", label: "Production" },
  { href: "/catalog", label: "Catalog" },
  { href: "/artwork", label: "Artwork" },
  { href: "/documents", label: "Documents" },
  { href: "/messages", label: "Messages" },
];

/** "Selam Haile" → "SH" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export type Role = "customer_user" | "admin" | "sales" | "production" | "quality" | "warehouse";
export type StaffRole = Exclude<Role, "customer_user">;

export const STAFF_ROLES: StaffRole[] = ["admin", "sales", "production", "quality", "warehouse"];

export const ROLE_LABELS: Record<Role, string> = {
  customer_user: "Customer",
  admin: "Admin",
  sales: "Sales",
  production: "Production",
  quality: "Quality",
  warehouse: "Warehouse",
};

export function isStaffRole(role: Role): role is StaffRole {
  return role !== "customer_user";
}

/** Staff navigation. `roles` lists who sees the item (docs/PORTAL_SPEC.md §1). */
export const OPS_NAV: { href: string; label: string; roles: StaffRole[] }[] = [
  { href: "/ops", label: "Overview", roles: STAFF_ROLES },
  { href: "/ops/orders", label: "Orders", roles: ["admin", "sales", "production", "quality"] },
  { href: "/ops/production", label: "Production", roles: ["admin", "production"] },
  { href: "/ops/quality", label: "Quality", roles: ["admin", "quality"] },
  { href: "/ops/inventory", label: "Inventory", roles: ["admin", "warehouse"] },
  { href: "/ops/artwork", label: "Artwork", roles: ["admin", "sales"] },
  { href: "/ops/documents", label: "Documents", roles: ["admin", "sales"] },
  { href: "/ops/customers", label: "Customers", roles: ["admin", "sales"] },
  { href: "/ops/messages", label: "Messages", roles: STAFF_ROLES },
  { href: "/ops/users", label: "Users", roles: ["admin"] },
];

export const CUSTOMER_NAV: { href: string; label: string }[] = [
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/production", label: "Production" },
  { href: "/artwork", label: "Artwork" },
  { href: "/documents", label: "Documents" },
  { href: "/messages", label: "Messages" },
];

/** Roles allowed on an /ops section — pages enforce this, not just the menu. */
export function opsRolesFor(href: string): StaffRole[] {
  const item = OPS_NAV.find((n) => n.href === href);
  if (!item) throw new Error(`No OPS_NAV entry for ${href}`);
  return item.roles;
}

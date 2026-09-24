import type { CSSProperties } from "react";
import {
  ORDER_STATUS_PILL,
  PILL_BASE,
  statusBadgeLabel,
  USER_STATUS_PILL,
  type OrderStatus,
  type UserStatus,
} from "@/lib/order-status";

export function Pill({ style, children }: { style: CSSProperties; children: React.ReactNode }) {
  return <span style={{ ...PILL_BASE, ...style }}>{children}</span>;
}

export default function StatusBadge({
  status,
  audience = "staff",
}: {
  status: OrderStatus;
  audience?: "staff" | "customer";
}) {
  return <Pill style={ORDER_STATUS_PILL[status]}>{statusBadgeLabel(status, audience)}</Pill>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { label, style } = USER_STATUS_PILL[status];
  return <Pill style={style}>{label}</Pill>;
}

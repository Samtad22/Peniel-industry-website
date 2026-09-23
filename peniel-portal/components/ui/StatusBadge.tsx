import clsx from "clsx";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE, type OrderStatus } from "@/lib/order-status";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-navy-tint text-navy",
  progress: "bg-sky-50 text-sky-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[ORDER_STATUS_TONE[status]],
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

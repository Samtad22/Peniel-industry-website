import clsx from "clsx";
import type { TimelineStep } from "@/lib/order-timeline";

/**
 * Order progress (design: customer 1b "Progress", staff 1f "Timeline").
 * Customers see the current step in the accent colour; staff in deep red.
 */
export default function Timeline({ steps, tone = "customer" }: { steps: TimelineStep[]; tone?: "customer" | "staff" }) {
  const now = tone === "customer" ? "var(--color-accent)" : "var(--color-accent-800)";
  return (
    <ol className="m-0 list-none border-t-2 border-divider p-0">
      {steps.map((s, i) => (
        <li
          key={i}
          className={clsx(
            "grid grid-cols-[20px_1fr_auto] gap-3 border-b border-divider py-2.5",
            tone === "customer" ? "text-[14px]" : "text-[13px]",
            s.state === "next" && "opacity-50",
          )}
        >
          <span
            aria-hidden="true"
            className="mt-[5px] size-3"
            style={{
              background: s.state === "done" ? "var(--color-text)" : s.state === "now" ? now : "transparent",
              border: s.state === "next" ? "2px solid var(--color-text)" : undefined,
              boxShadow: s.state === "now" && tone === "customer" ? "0 0 0 4px var(--color-accent-200)" : undefined,
            }}
          />
          <span className={s.state === "now" ? "font-extrabold" : undefined}>
            {s.label}
            {s.note && <span className="mt-0.5 block text-[13px] font-normal">{s.note}</span>}
          </span>
          <span
            className={clsx("text-[13px]", s.state === "now" && "font-extrabold")}
            style={s.state === "now" ? { color: tone === "customer" ? "var(--color-accent-700)" : now } : undefined}
          >
            {s.date}
          </span>
        </li>
      ))}
    </ol>
  );
}

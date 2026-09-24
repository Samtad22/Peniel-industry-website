import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDayMonth, formatQty, timeAgo } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";

export type DashOrder = {
  id: string;
  order_no: string;
  company: string;
  brand: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  due_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
  created_at: string;
};

export type DashProof = { id: string; brand: string; company: string; order_no: string | null; sent_at: string };
export type DashMessage = { id: string; author: string; company: string; body: string; created_at: string };

export type DashboardData = {
  greeting: string;
  firstName: string;
  nowLine: string;
  now: string;
  inbox: DashOrder[];
  due7: DashOrder[];
  onHold: DashOrder[];
  proofs: DashProof[];
  unread: DashMessage[];
  unreadAssignedToMe: number;
};

const shortCompany = (name: string) => name.replace(/\s+(S\.C\.|PLC|Ethiopia)$/i, "");

function Kpi({
  href,
  label,
  value,
  sub,
  hot,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  hot?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "block border-b-2 border-l-2 border-divider px-6 py-5 no-underline sm:first:pl-8 " +
        (hot ? "bg-accent text-bg hover:text-bg" : "text-text hover:bg-text/5 hover:text-text")
      }
    >
      <h6 className={"m-0 " + (hot ? "" : "opacity-60")}>{label}</h6>
      <div className="kpi">{value}</div>
      <div className="text-[12px]">{sub}</div>
    </Link>
  );
}

function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="border-b-2 border-l-2 border-divider px-4 py-6 sm:px-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="m-0">{title}</h4>
        <Link href={link.href} className="shrink-0 text-[13px]">
          {link.label}
        </Link>
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="m-0 border-b border-divider py-2.5 text-[14px] opacity-60">{children}</p>
);

/** Peniel Ops dashboard — design screen 1a ("Sales home"), fed by real data. */
export default function DashboardView({ d }: { d: DashboardData }) {
  const now = new Date(d.now);
  const oldest = d.inbox.at(-1);
  const dueQty = d.due7.reduce((s, o) => s + o.quantity, 0);
  const holdCompanies = [...new Set(d.onHold.map((o) => shortCompany(o.company)))];
  const oldestProof = d.proofs.at(-1);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-divider px-4 py-5 sm:px-8">
        <h2 className="m-0 flex-1 max-sm:text-[26px]">
          {d.greeting}, {d.firstName}
        </h2>
        <span className="text-[13px] opacity-70">{d.nowLine}</span>
      </div>

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi
            href="/ops/inbox"
            hot={d.inbox.length > 0}
            label="New orders to confirm"
            value={d.inbox.length}
            sub={oldest ? <>oldest {timeAgo(oldest.created_at, now)} →</> : "all confirmed"}
          />
          <Kpi
            href="/ops/artwork"
            label="Proofs awaiting customer"
            value={d.proofs.length}
            sub={oldestProof ? `oldest sent ${timeAgo(oldestProof.sent_at, now)}` : "none out"}
          />
          <Kpi
            href="/ops/orders?due=7"
            label="Due in 7 days"
            value={d.due7.length}
            sub={d.due7.length ? `${formatQty(dueQty)} crowns` : "nothing due"}
          />
          <Kpi
            href="/ops/orders?status=on_hold"
            label="On hold"
            value={d.onHold.length}
            sub={holdCompanies.length ? holdCompanies.join(", ") : "none"}
          />
          <Kpi
            href="/ops/messages"
            label="Unread messages"
            value={d.unread.length}
            sub={`${d.unreadAssignedToMe} assigned to you`}
          />
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid lg:grid-cols-2">
          <Panel title="Order inbox" link={{ href: "/ops/inbox", label: "Open inbox →" }}>
            {d.inbox.length === 0 && <Empty>No orders waiting for confirmation.</Empty>}
            {d.inbox.map((o) => (
              <Link
                key={o.id}
                href={`/ops/inbox?o=${o.id}`}
                className="grid grid-cols-[minmax(0,1fr)_64px_80px] gap-2.5 border-b border-divider py-2.5 text-[14px] text-text no-underline hover:bg-text/5 hover:text-text"
              >
                <span className="min-w-0">
                  <b>{shortCompany(o.company)}</b> · {o.brand}
                  <br />
                  <span className="text-[12px] opacity-65">
                    PO {o.po_number} · req. {formatDayMonth(o.requested_date)}
                  </span>
                </span>
                <b className="text-right">{formatQty(o.quantity)}</b>
                <span className="text-right text-[12px] opacity-70">{timeAgo(o.created_at, now)}</span>
              </Link>
            ))}
          </Panel>

          <Panel title="Due in the next 7 days" link={{ href: "/ops/orders", label: "All orders →" }}>
            {d.due7.length === 0 && <Empty>No open orders due this week.</Empty>}
            {d.due7.map((o) => (
              <Link
                key={o.id}
                href={`/ops/orders/${o.id}`}
                className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-2.5 border-b border-divider py-2.5 text-[14px] text-text no-underline hover:bg-text/5 hover:text-text sm:grid-cols-[96px_minmax(0,1fr)_64px_190px]"
              >
                <b>{o.order_no}</b>
                <span className="min-w-0 truncate">
                  {shortCompany(o.company).split(" ")[0]} · {o.brand}
                </span>
                <span>{formatDayMonth(o.due_date)}</span>
                <span className="col-span-3 sm:col-span-1">
                  <StatusBadge status={o.status} />
                </span>
              </Link>
            ))}
          </Panel>

          <Panel title="Proofs awaiting customer approval" link={{ href: "/ops/artwork", label: "Artwork →" }}>
            {d.proofs.length === 0 && <Empty>No proofs out with customers.</Empty>}
            {d.proofs.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5 border-b border-divider py-2.5 text-[14px]"
              >
                <span className="min-w-0">
                  <b>{p.brand} proof</b>
                  <br />
                  <span className="text-[12px] opacity-65">
                    {shortCompany(p.company)}
                    {p.order_no && ` · ${p.order_no}`}
                  </span>
                </span>
                <span>sent {formatDayMonth(p.sent_at)}</span>
              </div>
            ))}
          </Panel>

          <Panel title="On hold · Unread messages" link={{ href: "/ops/messages", label: "Messages →" }}>
            {d.onHold.length === 0 && d.unread.length === 0 && <Empty>Nothing on hold, no unread messages.</Empty>}
            {d.onHold.map((o) => (
              <Link
                key={o.id}
                href={`/ops/orders/${o.id}`}
                className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2.5 border-b border-divider py-2.5 text-[14px] text-text no-underline hover:bg-text/5 hover:text-text sm:grid-cols-[96px_minmax(0,1fr)_auto]"
              >
                <b>{o.order_no}</b>
                <span className="min-w-0">
                  {shortCompany(o.company).split(" ")[0]} · {o.brand}
                  {o.customer_reason && `: ${o.customer_reason}`}
                </span>
                <span className="col-start-2 sm:col-start-auto">
                  <StatusBadge status="on_hold" />
                </span>
              </Link>
            ))}
            {d.unread.length > 0 && (
              <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-2.5 border-b border-divider py-2.5 text-[14px]">
                <b className="text-accent-700">● {d.unread.length} new</b>
                <span className="min-w-0">
                  {d.unread[0].author} ({shortCompany(d.unread[0].company).split(" ")[0]}): &ldquo;
                  {d.unread[0].body.length > 90 ? `${d.unread[0].body.slice(0, 90)}…` : d.unread[0].body}&rdquo;
                </span>
                <span className="text-[12px] opacity-60">{timeAgo(d.unread[0].created_at, now)}</span>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

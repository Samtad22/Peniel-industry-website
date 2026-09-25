import StatusBadge from "@/components/ui/StatusBadge";
import { CustomerSees } from "@/components/ui/Visibility";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUSES, statusText, type OrderStatus } from "@/lib/order-status";
import InviteDialog from "./InviteDialog";
import OpsHeader from "./OpsHeader";
import UsersTable, { type UserRow } from "./UsersTable";

// Statuses that email the customer (docs/PORTAL_SPEC.md §4; lib/notify.ts).
// "Awaiting approval" is covered by the proof email itself.
const EMAILS_CUSTOMER: OrderStatus[] = ["confirmed", "on_hold", "rejected", "ready_for_pickup", "dispatched"];

export type EmailLogRow = { id: number; kind: string; recipient: string; subject: string; status: "sent" | "failed" | "skipped"; created_at: string };

const EVENTS: [string, string][] = [
  ["Customer", "Order confirmed, on hold, not accepted, ready for pickup, dispatched, or a new due date (with the reason)"],
  ["Customer", "Artwork proof waiting for approval · new document shared · new message from Peniel"],
  ["Sales & Admin", "New order submitted · proof approved or changes requested · new customer message (or the person assigned)"],
  ["Warehouse & Admin", "Pickup requested"],
];

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b-2 border-l-2 border-divider px-4 py-6 sm:px-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Settings — design screen 1s (admins only). */
export default function SettingsView({
  staff,
  presets,
  meId,
  email,
}: {
  staff: UserRow[];
  presets: { id: string; text: string }[];
  meId: string;
  email: { configured: boolean; from: string | null; log: EmailLogRow[] };
}) {
  return (
    <>
      <OpsHeader title="Settings" />
      <div className="overflow-hidden">
        <div className="-ml-0.5 grid xl:grid-cols-2">
          <Section title="Staff users & roles" aside={<InviteDialog mode="staff" triggerLabel="+ Add staff" />}>
            <UsersTable users={staff} canManage meId={meId} />
          </Section>

          <Section title="Order status list" aside={<CustomerSees>Customer sees these labels</CustomerSees>}>
            <div className="th-row grid grid-cols-[216px_minmax(0,1fr)_110px] gap-2.5 border-b-2 border-divider py-1.5">
              <span>Status</span>
              <span>Customer label</span>
              <span>Email customer</span>
            </div>
            {ORDER_STATUSES.map((s) => (
              <div
                key={s}
                className="grid grid-cols-[216px_minmax(0,1fr)_110px] items-center gap-2.5 border-b border-divider py-1.5 text-[13px]"
              >
                <span>
                  <StatusBadge status={s} />
                </span>
                <span>{statusText(s, "customer")}</span>
                <span>{EMAILS_CUSTOMER.includes(s) ? "✓ Yes" : "—"}</span>
              </div>
            ))}
            <p className="mb-0 mt-2 text-[12px] opacity-70">“Awaiting approval” is announced by the proof email itself.</p>
          </Section>

          <Section title="Delay & hold reason presets">
            <div className="mb-2 text-[12px] font-extrabold text-accent-800">
              ⚠ Written for the customer — do not include line or machine names.
            </div>
            {presets.length === 0 && <p className="m-0 text-[13px] opacity-60">No presets yet.</p>}
            {presets.map((p, i) => (
              <div key={p.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b border-divider py-2 text-[13px]">
                <b>{i + 1}</b>
                <span>{p.text}</span>
              </div>
            ))}
            <p className="mb-0 mt-2 text-[12px] opacity-70">Staff pick these when they put an order on hold (Phase 2).</p>
          </Section>

          <Section
            title="Notification emails"
            aside={
              <span className={`tag ${email.configured ? "tag-neutral" : "tag-accent"}`}>
                {email.configured ? `● On · from ${email.from}` : "Off · not set up yet"}
              </span>
            }
          >
            {!email.configured && (
              <p className="mb-3 mt-0 bg-accent-100 px-3 py-2.5 text-[13px] text-accent-800">
                Emails are recorded below as “skipped” until RESEND_API_KEY and EMAIL_FROM are added in Vercel (see docs/LAUNCH.md).
              </p>
            )}
            <div className="border-t-2 border-divider text-[13px]">
              {EVENTS.map(([who, what]) => (
                <div key={what} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-divider py-2">
                  <b>{who}</b>
                  <span>{what}</span>
                </div>
              ))}
            </div>
            <h6 className="mb-1 mt-4">Latest emails</h6>
            <div className="border-t-2 border-divider text-[12px]">
              {email.log.length === 0 && <p className="m-0 py-2 opacity-60">None yet.</p>}
              {email.log.map((l) => (
                <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_70px] gap-2 border-b border-divider py-1.5">
                  <span className="min-w-0">
                    <b className="block truncate">{l.subject}</b>
                    <span className="opacity-60">
                      {l.recipient} · {formatDateTime(l.created_at)}
                    </span>
                  </span>
                  <span className={l.status === "failed" ? "font-extrabold text-accent-700" : l.status === "sent" ? "" : "opacity-60"}>{l.status}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

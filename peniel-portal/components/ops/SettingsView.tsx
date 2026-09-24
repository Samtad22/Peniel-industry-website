import StatusBadge from "@/components/ui/StatusBadge";
import { CustomerSees } from "@/components/ui/Visibility";
import { ORDER_STATUSES, statusText, type OrderStatus } from "@/lib/order-status";
import InviteDialog from "./InviteDialog";
import OpsHeader from "./OpsHeader";
import UsersTable, { type UserRow } from "./UsersTable";

// Statuses that email the customer (docs/PORTAL_SPEC.md §4). Sending starts in Phase 5.
const EMAILS_CUSTOMER: OrderStatus[] = ["confirmed", "awaiting_approval", "on_hold", "ready_for_pickup", "dispatched"];

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
}: {
  staff: UserRow[];
  presets: { id: string; text: string }[];
  meId: string;
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
            <p className="mb-0 mt-2 text-[12px] opacity-70">Emails to customers start in Phase 5.</p>
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

          <Section title="Notification emails">
            <p className="m-0 text-[13px]">
              Who gets emailed for new orders, proof decisions, QC holds, pickup requests and customer messages. This
              arrives with email notifications in Phase 5.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { describeActivity, type ActivityRow } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUSES, statusText, type OrderStatus } from "@/lib/order-status";
import type { StaffRole } from "@/lib/roles";
import type { Settings } from "@/lib/settings";
import InviteDialog from "./InviteDialog";
import OpsHeader from "./OpsHeader";
import { SectionHead } from "./OpsKit";
import { CustomerWarning } from "./OrderForms";
import { CoaForm, EmailsForm, PlantForm, PresetList, TestEmailButton } from "./SettingsForms";
import UsersTable, { type UserRow } from "./UsersTable";

// Statuses that email the customer (docs/PORTAL_SPEC.md §4; lib/notify.ts).
// "Awaiting approval" is covered by the proof email itself.
const EMAILS_CUSTOMER: OrderStatus[] = ["confirmed", "on_hold", "rejected", "ready_for_pickup", "dispatched"];

export type EmailLogRow = { id: number; kind: string; recipient: string; subject: string; status: "sent" | "failed" | "skipped"; error: string | null; created_at: string };

type Preset = { id: string; text: string };

function Section({ id, title, aside, children }: { id?: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-b-2 border-l-2 border-divider px-4 py-6 sm:px-8">
      <div className="mb-3">
        <SectionHead title={title}>{aside}</SectionHead>
      </div>
      {children}
    </section>
  );
}

const JUMP: [string, string][] = [
  ["#staff", "Staff"],
  ["#plant", "Plant defaults"],
  ["#coa", "Certificate"],
  ["#emails", "Emails"],
  ["#reasons", "Reasons"],
  ["#statuses", "Statuses"],
  ["#activity", "Activity"],
];

/** Settings — design screen 1s (admins only). */
export default function SettingsView({
  staff,
  presets,
  meId,
  settings,
  email,
  activity,
  names,
}: {
  staff: UserRow[];
  presets: { hold: Preset[]; reject: Preset[] };
  meId: string;
  settings: Settings;
  email: { configured: boolean; from: string | null; log: EmailLogRow[] };
  activity: ActivityRow[];
  /** user_id → full name, for the activity list. */
  names: Record<string, string>;
}) {
  const active = staff.filter((u) => u.active && u.role !== "customer_user") as (UserRow & { role: StaffRole })[];
  const failed = email.log.filter((l) => l.status === "failed").length;
  return (
    <>
      <OpsHeader title="Settings" sub="Staff and roles, plant defaults, the certificate, emails, the reasons staff pick from, and who changed what." />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-x-4 gap-y-1 border-b-2 border-divider px-4 py-2.5 text-[12px] sm:px-8">
        {JUMP.map(([href, label]) => (
          <a key={href} href={href} className="underline underline-offset-2">
            {label}
          </a>
        ))}
      </nav>
      <div className="overflow-hidden">
        <div className="-ml-0.5 grid xl:grid-cols-2">
          <div className="xl:col-span-2">
            <Section id="staff" title="Staff users & roles" aside={<InviteDialog mode="staff" triggerLabel="+ Add staff" />}>
              <UsersTable users={staff} canManage meId={meId} editRoles />
              <p className="mb-0 mt-2 text-[12px] opacity-70">
                Admin: everything · Sales: orders, artwork, documents, messages · Production: production, printed sheets, maintenance · Quality: inspections, sorting, certificates · Warehouse: stock, pickups, raw materials. You can&apos;t change your own role.
              </p>
            </Section>
          </div>

          <Section id="plant" title="Plant defaults" aside={<InternalOnly />}>
            <PlantForm plant={settings.plant} />
          </Section>

          <Section id="coa" title="Certificate of Analysis" aside={<CustomerSees>Printed on every certificate</CustomerSees>}>
            <CoaForm coa={settings.coa} />
          </Section>

          <div className="xl:col-span-2">
            <Section
              id="emails"
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
              <div className="grid gap-8 xl:grid-cols-2">
                <EmailsForm off={settings.emails_off} staff={active} recipients={settings.report_recipients} />
                <div className="flex flex-col gap-3">
                  <TestEmailButton />
                  <h6 className="mb-0 mt-2 flex items-baseline justify-between border-b-2 border-text pb-1.5">
                    <span>Latest emails</span>
                    {failed > 0 && <span className="text-[12px] font-extrabold text-accent-700">{failed} failed</span>}
                  </h6>
                  <div className="max-h-[520px] overflow-y-auto text-[12px]">
                    {email.log.length === 0 && <p className="m-0 py-2 opacity-60">None yet.</p>}
                    {email.log.map((l) => (
                      <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_62px] gap-2 border-b border-divider py-1.5">
                        <span className="min-w-0">
                          <b className="block truncate">{l.subject}</b>
                          <span className="opacity-60">
                            {l.recipient} · {formatDateTime(l.created_at)}
                          </span>
                          {l.error && l.status !== "sent" && <span className={`block ${l.status === "failed" ? "text-accent-700" : "opacity-60"}`}>{l.error}</span>}
                        </span>
                        <span className={l.status === "failed" ? "font-extrabold text-accent-700" : l.status === "sent" ? "" : "opacity-60"}>{l.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <Section id="reasons" title="Hold & delay reasons" aside={<CustomerSees>Customer reads these</CustomerSees>}>
            <div className="mb-3">
              <CustomerWarning />
            </div>
            <PresetList kind="hold" presets={presets.hold} />
            <p className="mb-0 mt-2 text-[12px] opacity-70">Staff pick these when they put an order or batch on hold or change its date. They can still edit the words.</p>
          </Section>

          <Section title="Reasons for not accepting an order" aside={<CustomerSees>Customer reads these</CustomerSees>}>
            <PresetList kind="reject" presets={presets.reject} />
            <p className="mb-0 mt-2 text-[12px] opacity-70">Staff pick these when they don&apos;t accept a new order.</p>
          </Section>

          <Section id="statuses" title="Order status list" aside={<CustomerSees>Customer sees these labels</CustomerSees>}>
            <div className="th-row grid grid-cols-[216px_minmax(0,1fr)_110px] gap-2.5 border-b border-divider py-1.5">
              <span>Status</span>
              <span>Customer label</span>
              <span>Email customer</span>
            </div>
            {ORDER_STATUSES.map((s) => (
              <div key={s} className="grid grid-cols-[216px_minmax(0,1fr)_110px] items-center gap-2.5 border-b border-divider py-1.5 text-[13px]">
                <span>
                  <StatusBadge status={s} />
                </span>
                <span>{statusText(s, "customer")}</span>
                <span>{EMAILS_CUSTOMER.includes(s) ? (settings.emails_off.includes("customer_orders") ? "Off" : "✓ Yes") : "-"}</span>
              </div>
            ))}
            <p className="mb-0 mt-2 text-[12px] opacity-70">“Awaiting approval” is announced by the proof email itself.</p>
          </Section>

          <Section
            id="activity"
            title="Recent activity"
            aside={
              <Link href="/ops/settings/activity" className="btn btn-secondary btn-split text-text">
                Full activity log
                <span aria-hidden="true">→</span>
              </Link>
            }
          >
            <div className="text-[12px]">
              {activity.length === 0 && <p className="m-0 py-2 opacity-60">Nothing yet.</p>}
              {activity.map((r) => {
                const d = describeActivity(r);
                return (
                  <div key={r.id} className="border-b border-divider py-1.5">
                    <b>
                      {d.thing} {d.what}
                    </b>
                    {d.subject && <span> · {d.subject}</span>}
                    <span className="block opacity-60">
                      {r.actor ? (names[r.actor] ?? "Someone") : "The portal"} · {formatDateTime(r.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

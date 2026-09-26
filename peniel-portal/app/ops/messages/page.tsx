import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { assignThread } from "@/app/ops/messages/actions";
import { Composer, NewThreadDialog } from "@/components/ops/MessageForms";
import { AttachmentChips, AttachmentsTable, ThreadTabs } from "@/components/ui/MessageAttachments";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, formatDayMonth, timeAgo } from "@/lib/format";
import type { MessageAttachment } from "@/lib/message-files";
import { OPEN_STATUSES } from "@/lib/order-status";
import { opsRolesFor, ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

type Thread = {
  id: string;
  subject: string;
  company_id: string;
  order_id: string | null;
  assigned_to: string | null;
  last_message_at: string;
  companies: { name: string } | null;
  orders: { order_no: string } | null;
};

type Msg = {
  id: string;
  thread_id: string;
  body: string;
  internal: boolean;
  read_by_staff: boolean;
  created_at: string;
  profiles: { full_name: string; role: string } | null;
};

const FILTERS = { all: "All", mine: "Assigned to me", unassigned: "Unassigned" } as const;

/** Staff messages — threads per customer and order, with assignment (design 1q). */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ f?: string; t?: string; view?: string }> }) {
  const me = await requireStaff(opsRolesFor("messages"));
  const sp = await searchParams;
  const view = sp.view === "files" ? "files" : "messages";
  const f = sp.f === "mine" || sp.f === "unassigned" ? sp.f : "all";
  const supabase = await createClient();
  const now = new Date();

  const [{ data: threads }, { data: staff }, { data: companies }, { data: orders }] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, subject, company_id, order_id, assigned_to, last_message_at, companies(name), orders(order_no)")
      .order("last_message_at", { ascending: false })
      .limit(200)
      .returns<Thread[]>(),
    supabase
      .from("profiles")
      .select("user_id, full_name, role")
      .neq("role", "customer_user")
      .eq("active", true)
      .order("full_name")
      .returns<{ user_id: string; full_name: string; role: string }[]>(),
    supabase.from("companies").select("id, name").eq("active", true).order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("orders")
      .select("id, company_id, order_no, brands(name)")
      .in("status", OPEN_STATUSES)
      .order("order_no", { ascending: false })
      .returns<{ id: string; company_id: string; order_no: string; brands: { name: string } | null }[]>(),
  ]);

  const all = threads ?? [];
  const ids = all.map((t) => t.id);
  const { data: msgs } = ids.length
    ? await supabase
        .from("messages")
        .select("id, thread_id, body, internal, read_by_staff, created_at, profiles(full_name, role)")
        .in("thread_id", ids)
        .order("created_at")
        .returns<Msg[]>()
    : { data: [] as Msg[] };
  const byThread = new Map<string, Msg[]>();
  for (const m of msgs ?? []) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m]);
  const name = new Map((staff ?? []).map((s) => [s.user_id, s.full_name]));

  const shown = all.filter((t) => (f === "mine" ? t.assigned_to === me.user_id : f === "unassigned" ? !t.assigned_to : true));
  const selected = all.find((t) => t.id === sp.t) ?? shown[0] ?? null;
  const thread = selected ? (byThread.get(selected.id) ?? []) : [];

  // Opening a conversation marks the customer's messages in it as read.
  if (selected && thread.some((m) => !m.read_by_staff)) {
    await supabase.from("messages").update({ read_by_staff: true }).eq("thread_id", selected.id).eq("read_by_staff", false);
  }
  const { data: files } = selected
    ? await supabase
        .from("message_attachments")
        .select("id, message_id, file_name, size_bytes, mime_type, created_at")
        .eq("thread_id", selected.id)
        .order("created_at", { ascending: false })
        .returns<MessageAttachment[]>()
    : { data: [] as MessageAttachment[] };
  const filesOf = (id: string) => (files ?? []).filter((x) => x.message_id === id).reverse();
  const msgById = new Map(thread.map((m) => [m.id, m]));
  const customers = [...new Set(thread.filter((m) => m.profiles?.role === "customer_user").map((m) => m.profiles!.full_name))];
  const link = (p: { f?: string; t?: string }) => {
    const q = new URLSearchParams();
    const ff = p.f ?? f;
    if (ff !== "all") q.set("f", ff);
    if (p.t) q.set("t", p.t);
    const s = q.toString();
    return s ? `/ops/messages?${s}` : "/ops/messages";
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="border-divider lg:border-r-2">
        <div className="flex flex-col gap-2.5 border-b-2 border-divider px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0">Messages</h3>
            <NewThreadDialog
              companies={companies ?? []}
              orders={(orders ?? []).map((o) => ({ id: o.id, company_id: o.company_id, label: `${o.order_no} · ${o.brands?.name ?? ""}` }))}
            />
          </div>
          <div className="seg self-start">
            {Object.entries(FILTERS).map(([k, v]) => (
              <Link key={k} href={link({ f: k })} className={`seg-opt no-underline ${f === k ? "!bg-accent !text-bg" : "text-text"}`}>
                {v}
              </Link>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="m-0 px-6 py-4 text-[14px] opacity-70">No conversations here.</p>}
        {shown.map((t) => {
          const list = byThread.get(t.id) ?? [];
          const last = [...list].reverse().find((m) => !m.internal) ?? list.at(-1);
          const unread = list.filter((m) => !m.read_by_staff && m.profiles?.role === "customer_user").length;
          const on = t.id === selected?.id;
          return (
            <Link
              key={t.id}
              href={link({ t: t.id })}
              scroll={false}
              aria-current={on ? "true" : undefined}
              className={`flex flex-col gap-1 border-b border-divider px-4 py-3 text-[13px] text-text no-underline hover:text-text sm:px-6 ${
                on ? "bg-neutral-200 shadow-[inset_4px_0_0_var(--color-accent)]" : "hover:bg-text/5"
              } ${unread ? "font-extrabold" : ""}`}
            >
              <span className="flex justify-between gap-2">
                <b className="truncate">{t.companies?.name ?? "-"}</b>
                <span className="shrink-0 text-[12px] font-normal opacity-70">{timeAgo(t.last_message_at, now)}</span>
              </span>
              <span className="truncate">
                {t.orders?.order_no ? `${t.orders.order_no} · ` : ""}
                {t.subject}
              </span>
              <span className="flex justify-between gap-2 font-normal">
                <span className="truncate opacity-70">{last?.body ?? ""}</span>
                {unread > 0 && <span className="shrink-0 bg-accent px-1.5 text-[11px] font-extrabold text-bg">{unread}</span>}
              </span>
              <span className="text-[11px] font-normal opacity-60">→ {t.assigned_to ? (name.get(t.assigned_to) ?? "Someone") : "Unassigned"}</span>
            </Link>
          );
        })}
      </div>

      {selected ? (
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-end gap-3 border-b-2 border-divider px-4 py-4 sm:px-8">
            <div className="min-w-0 flex-[1_1_260px]">
              <h4 className="m-0">
                {selected.companies?.name ?? "-"}
                {selected.orders?.order_no && ` · ${selected.orders.order_no}`}
              </h4>
              <div className="text-[13px] opacity-70">
                {selected.subject}
                {customers.length > 0 && ` · with ${customers.join(", ")}`}
              </div>
            </div>
            <form action={assignThread} className="flex items-end gap-2">
              <input type="hidden" name="thread_id" value={selected.id} />
              <div className="field w-[230px]">
                <label htmlFor="assign">Assigned to</label>
                <select id="assign" name="assigned_to" defaultValue={selected.assigned_to ?? ""} className="input">
                  <option value="">Unassigned</option>
                  {(staff ?? []).map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                      {s.user_id === me.user_id ? " (you)" : ` · ${ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] ?? s.role}`}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-secondary text-text">
                Save
              </button>
            </form>
            {selected.order_id && (
              <Link href={`/ops/orders/${selected.order_id}`} className="btn btn-secondary text-text">
                Open order ↗
              </Link>
            )}
          </div>
          <div className="px-4 pt-2 sm:px-8">
            <ThreadTabs base={link({ t: selected.id })} view={view} count={(files ?? []).length} />
          </div>
          {view === "files" ? (
            <div className="flex-1 px-4 py-5 sm:px-8">
              <AttachmentsTable
                files={(files ?? []).map((x) => {
                  const m = msgById.get(x.message_id);
                  return { ...x, internal: m?.internal, from: m?.profiles?.full_name ?? "-" };
                })}
                empty="No files in this conversation yet. Attach one to a reply or an internal note and it appears here."
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 px-4 py-5 sm:px-8">
              {thread.map((m) => {
                const fromCustomer = m.profiles?.role === "customer_user";
                return (
                  <div
                    key={m.id}
                    className={`max-w-[640px] px-3.5 py-2.5 text-[14px] ${
                      m.internal
                        ? "self-end border border-dashed border-neutral-600 bg-neutral-200"
                        : fromCustomer
                          ? "self-start bg-surface"
                          : "self-end bg-text text-bg"
                    }`}
                  >
                    <div className={`mb-1 flex items-center gap-1.5 text-[11px] ${m.internal ? "" : "opacity-70"}`}>
                      {m.internal && <Lock size={11} aria-hidden="true" />}
                      {m.internal ? "Internal note · " : ""}
                      {m.profiles?.full_name ?? "-"}
                      {fromCustomer && ` · ${selected.companies?.name.split(" ")[0] ?? ""}`} · {formatDayMonth(m.created_at)}{" "}
                      {formatDateTime(m.created_at).slice(-5)}
                    </div>
                    <div className="whitespace-pre-line">{m.body}</div>
                    <AttachmentChips files={filesOf(m.id)} dark={!m.internal && !fromCustomer} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t-2 border-divider px-4 py-4 sm:px-8">
            <Composer threadId={selected.id} companyId={selected.company_id} />
          </div>
        </div>
      ) : (
        <div className="px-6 py-10 text-[14px] opacity-70">No conversations yet. Customers&apos; messages appear here.</div>
      )}
    </div>
  );
}

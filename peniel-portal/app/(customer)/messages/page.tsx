import type { Metadata } from "next";
import Link from "next/link";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import { CustomerReply, NewConversation } from "@/components/customer/MessageForms";
import { formatDateTime, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

type Thread = { id: string; order_id: string | null; subject: string; last_message_at: string };
type Msg = { id: string; thread_id: string; body: string; from_peniel: boolean; author_name: string; read_by_customer: boolean; created_at: string };

/** Customer messages with Peniel. Reads customer_* views only; internal notes never appear. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ t?: string; new?: string; order?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const now = new Date();

  const [{ data: threads }, { data: msgs }, { data: orders }] = await Promise.all([
    supabase
      .from("customer_message_threads")
      .select("id, order_id, subject, last_message_at")
      .order("last_message_at", { ascending: false })
      .returns<Thread[]>(),
    supabase
      .from("customer_messages")
      .select("id, thread_id, body, from_peniel, author_name, read_by_customer, created_at")
      .order("created_at")
      .returns<Msg[]>(),
    supabase
      .from("customer_orders")
      .select("id, order_no, brand_name, status")
      .not("status", "in", "(rejected)")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<{ id: string; order_no: string; brand_name: string }[]>(),
  ]);

  const orderNo = new Map((orders ?? []).map((o) => [o.id, o.order_no]));
  const composing = sp.new === "1" || (threads ?? []).length === 0;
  const selected = composing ? null : ((threads ?? []).find((t) => t.id === sp.t) ?? (threads ?? [])[0]);
  const thread = selected ? (msgs ?? []).filter((m) => m.thread_id === selected.id) : [];
  if (selected && thread.some((m) => m.from_peniel && !m.read_by_customer)) {
    await supabase.rpc("customer_mark_thread_read", { p_thread_id: selected.id });
  }

  return (
    <>
      <CustomerPageHead
        section="Messages"
        title="Messages with Peniel"
        aside={
          <Link href="/messages?new=1" className="btn btn-primary">
            + New message
          </Link>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-divider max-lg:border-b-2 lg:border-r-2">
          {(threads ?? []).length === 0 && <p className="m-0 px-4 py-4 text-[14px] opacity-70 sm:px-10">No conversations yet.</p>}
          {(threads ?? []).map((t) => {
            const list = (msgs ?? []).filter((m) => m.thread_id === t.id);
            const unread = list.filter((m) => m.from_peniel && !m.read_by_customer).length;
            const on = t.id === selected?.id;
            return (
              <Link
                key={t.id}
                href={`/messages?t=${t.id}`}
                aria-current={on ? "true" : undefined}
                className={`flex min-h-12 flex-col gap-1 border-b border-divider px-4 py-3 text-[14px] text-text no-underline hover:text-text sm:pl-10 ${
                  on ? "bg-neutral-200 shadow-[inset_4px_0_0_var(--color-accent)]" : "hover:bg-text/5"
                }`}
              >
                <span className="flex justify-between gap-2">
                  <b className="truncate">{t.subject}</b>
                  <span className="shrink-0 text-[12px] opacity-70">{timeAgo(t.last_message_at, now)}</span>
                </span>
                <span className="flex justify-between gap-2 text-[12px]">
                  <span className="truncate opacity-70">
                    {t.order_id && orderNo.get(t.order_id) ? `${orderNo.get(t.order_id)} · ` : ""}
                    {list.at(-1)?.body ?? ""}
                  </span>
                  {unread > 0 && <span className="shrink-0 bg-accent px-1.5 font-extrabold text-bg">{unread} new</span>}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="min-w-0 px-4 py-6 sm:px-10">
          {composing ? (
            <>
              <h3 className="mb-4 mt-0">New message</h3>
              <NewConversation
                orders={(orders ?? []).map((o) => ({ id: o.id, label: `${o.order_no} · ${o.brand_name}` }))}
                orderId={sp.order}
              />
            </>
          ) : selected ? (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="m-0">{selected.subject}</h3>
                {selected.order_id && (
                  <Link href={`/orders/${selected.order_id}`} className="text-[13px]">
                    {orderNo.get(selected.order_id) ?? "Open order"} →
                  </Link>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[640px] px-3.5 py-2.5 text-[14px] ${m.from_peniel ? "self-start bg-surface" : "self-end bg-text text-bg"}`}
                  >
                    <div className="mb-1 text-[11px] opacity-70">
                      {m.from_peniel ? `Peniel · ${m.author_name}` : m.author_name} · {formatDateTime(m.created_at)}
                    </div>
                    <div className="whitespace-pre-line">{m.body}</div>
                  </div>
                ))}
              </div>
              <CustomerReply threadId={selected.id} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

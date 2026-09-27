import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { InternalOnly } from "@/components/ui/Visibility";
import { ACTIVITY_AREAS, changedValues, describeActivity, type ActivityRow } from "@/lib/activity";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity log" };

const PAGE = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Every audited change: who, what, when (admin only). */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ area?: string; who?: string; from?: string; to?: string; page?: string }> }) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const area = ACTIVITY_AREAS.find((a) => a.key === sp.area);
  const who = sp.who && UUID.test(sp.who) ? sp.who : "";
  const from = sp.from && DAY.test(sp.from) ? sp.from : "";
  const to = sp.to && DAY.test(sp.to) ? sp.to : "";
  const page = Math.max(0, Math.min(200, Number.parseInt(sp.page ?? "0", 10) || 0));
  const supabase = await createClient();

  let q = supabase.from("audit_log").select("id, actor, action, entity, entity_id, before, after, created_at");
  if (area) q = q.in("entity", area.entities);
  if (who) q = q.eq("actor", who);
  if (from) q = q.gte("created_at", `${from}T00:00:00+03:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59.999+03:00`);
  const [{ data: rows }, { data: people }] = await Promise.all([
    q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE).returns<ActivityRow[]>(),
    supabase.from("profiles").select("user_id, full_name, role").order("full_name").returns<{ user_id: string; full_name: string; role: Role }[]>(),
  ]);
  const list = (rows ?? []).slice(0, PAGE);
  const more = (rows ?? []).length > PAGE;
  const names = new Map((people ?? []).map((p) => [p.user_id, p]));
  const staff = (people ?? []).filter((p) => p.role !== "customer_user");
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (area) u.set("area", area.key);
    if (who) u.set("who", who);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (p) u.set("page", String(p));
    return `/ops/settings/activity${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <OpsHeader
        crumb={{ label: "Settings", href: "/ops/settings", current: "Activity log" }}
        title="Activity log"
        sub="Every change in the portal: who did it, what changed, and when. Click a row for the old and new values."
        actions={<InternalOnly />}
      />
      <form method="get" className="flex flex-wrap items-end gap-3 border-b-2 border-divider px-4 py-4 text-[13px] sm:px-8">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] opacity-70">Area</span>
          <select name="area" defaultValue={area?.key ?? ""} className="input min-h-10">
            <option value="">Everything</option>
            {ACTIVITY_AREAS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] opacity-70">Who</span>
          <select name="who" defaultValue={who} className="input min-h-10">
            <option value="">Anyone</option>
            {staff.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.full_name} ({ROLE_LABELS[p.role]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] opacity-70">From</span>
          <input type="date" name="from" defaultValue={from} className="input min-h-10" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] opacity-70">To</span>
          <input type="date" name="to" defaultValue={to} className="input min-h-10" />
        </label>
        <button type="submit" className="btn btn-primary min-h-10">
          Show
        </button>
        {(area || who || from || to) && (
          <Link href="/ops/settings/activity" className="self-center underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>
      <div className="px-4 pb-8 pt-2 sm:px-8">
        {list.length === 0 && <p className="py-4 text-[13px] opacity-60">Nothing matches.</p>}
        {list.map((r) => {
          const d = describeActivity(r);
          const person = r.actor ? names.get(r.actor) : null;
          const values = changedValues(r.before, r.after);
          return (
            <details key={r.id} className="group border-b border-divider py-2 text-[13px]">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 sm:grid-cols-[150px_minmax(0,1fr)_200px]">
                <span className="text-[12px] opacity-70 sm:order-none max-sm:col-span-2">{formatDateTime(r.created_at)}</span>
                <span className="min-w-0">
                  <b>
                    {d.thing} {d.what}
                  </b>
                  {d.subject && <span> · {d.subject}</span>}
                  {d.detail && <span className="block text-[12px] opacity-70">{d.detail}</span>}
                </span>
                <span className="text-right text-[12px] sm:text-left">
                  {person ? `${person.full_name} · ${ROLE_LABELS[person.role]}` : r.actor ? "Removed user" : "The portal (automatic)"}
                </span>
              </summary>
              <div className="mt-2 bg-neutral-100 px-3 py-2 text-[12px]">
                {values.length > 0 ? (
                  values.map((v) => (
                    <div key={v.field} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 py-0.5">
                      <b>{v.field}</b>
                      <span className="break-words">
                        <span className="line-through opacity-60">{v.from}</span> → {v.to}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="opacity-70">{r.action === "deleted" ? "The record was deleted." : r.action === "created" || r.action === "invited" ? "A new record." : "No field changes to show."}</span>
                )}
              </div>
            </details>
          );
        })}
        {(page > 0 || more) && (
          <div className="flex justify-between pt-4 text-[13px]">
            {page > 0 ? (
              <Link href={href(page - 1)} className="underline underline-offset-2">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {more && (
              <Link href={href(page + 1)} className="underline underline-offset-2">
                Older →
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

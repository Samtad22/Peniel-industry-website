import type { Metadata } from "next";
import Link from "next/link";
import { AddMachineDialog, DeleteJobButton, FinishJobDialog, LogJobDialog, MachineDialog } from "@/components/ops/MaintenanceForms";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import { Pill } from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDateTime } from "@/lib/format";
import { addisLocalNow } from "@/lib/inventory";
import {
  downtimeMinutes,
  formatDuration,
  MACHINE_SECTIONS,
  MACHINE_STATUS,
  machinesInOrder,
  MAINTENANCE_KINDS,
  nextServiceDue,
  type Machine,
  type MachineCategory,
  type MaintenanceLog,
} from "@/lib/maintenance";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Maintenance" };

/**
 * Maintenance (internal only): the plant's machines in four sections (CTP,
 * printing, coating oven, presses and liners), their status, jobs going on
 * now, downtime, planned services, and the maintenance log.
 */
export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const me = await requireStaff(opsRolesFor("maintenance"));
  const sp = await searchParams;
  const isAdmin = me.role === "admin";
  const today = addisDateISO(new Date());
  const now = new Date().toISOString();
  const nowLocal = addisLocalNow();
  const dayStart = `${today}T00:00:00+03:00`;
  const weekStart = `${addDays(today, -6)}T00:00:00+03:00`;
  const supabase = await createClient();

  const [{ data: machineData }, { data: logData }, { data: openData }] = await Promise.all([
    supabase
      .from("machines")
      .select("id, code, name, category, parent_id, sort_order, status, status_note, status_since, service_every_days")
      .eq("active", true)
      .order("sort_order")
      .returns<Machine[]>(),
    supabase
      .from("maintenance_logs")
      .select("id, machine_id, kind, started_at, finished_at, stopped_machine, description, parts, done_by, notes")
      .gte("started_at", `${addDays(today, -365)}T00:00:00+03:00`)
      .order("started_at", { ascending: false })
      .limit(500)
      .returns<MaintenanceLog[]>(),
    supabase
      .from("maintenance_logs")
      .select("id, machine_id, kind, started_at, finished_at, stopped_machine, description, parts, done_by, notes")
      .is("finished_at", null)
      .order("started_at")
      .returns<MaintenanceLog[]>(),
  ]);
  const machines = machineData ?? [];
  const byId = new Map(machines.map((m) => [m.id, m]));
  // Every log in the last year, plus any older job still open.
  const logs = [...(logData ?? []), ...(openData ?? []).filter((o) => !(logData ?? []).some((l) => l.id === o.id))];
  const open = openData ?? [];
  const logsOf = (id: string) => logs.filter((l) => l.machine_id === id);

  const installed = machines.filter((m) => m.status !== "on_order");
  const running = installed.filter((m) => m.status === "running").length;
  const down = machines.filter((m) => m.status === "down");
  const downToday = downtimeMinutes(logs, dayStart, now);
  const downWeek = downtimeMinutes(logs, weekStart, now);
  const services = machines.map((m) => ({ m, due: nextServiceDue(m, logsOf(m.id), today) })).filter((x) => x.due);
  const overdue = services.filter((x) => x.due!.days < 0);
  const section = MACHINE_SECTIONS.find((s) => s.category === sp.s)?.category as MachineCategory | undefined;
  const recent = logs.filter((l) => !section || byId.get(l.machine_id)?.category === section).slice(0, 40);
  const presses = machines.filter((m) => m.category === "press" && !m.parent_id);

  return (
    <>
      <OpsHeader
        title="Maintenance"
        sub={`${running} of ${installed.length} machines running · ${down.length} down · ${machines.length - installed.length} on the way`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && <AddMachineDialog presses={presses} />}
            <LogJobDialog machines={machines} nowLocal={nowLocal} />
          </div>
        }
      />
      <KpiStrip
        items={[
          { label: "Running", value: `${running}/${installed.length}`, sub: "installed machines" },
          { label: "Down now", value: down.length, sub: down.map((m) => m.name).join(", ") || "none", hot: down.length > 0 },
          { label: "Downtime today", value: formatDuration(downToday), sub: `${formatDuration(downWeek)} in 7 days`, warn: downToday > 0 },
          { label: "Services due", value: overdue.length, sub: overdue.length ? overdue.map((x) => x.m.name).join(", ") : `${services.length} on a schedule`, warn: overdue.length > 0 },
        ]}
      />

      <div className="flex flex-col gap-10 px-4 py-6 sm:px-8">
        {open.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHead title="Going on now" aside={`${open.length} open ${open.length === 1 ? "job" : "jobs"}`} />
            {open.map((j) => {
              const m = byId.get(j.machine_id);
              return (
                <div key={j.id} className={`grid items-center gap-3 border-b border-divider py-3 text-[14px] md:grid-cols-[minmax(0,1fr)_auto] ${j.stopped_machine ? "bg-accent-100 px-3 shadow-[inset_5px_0_0_var(--color-accent)]" : ""}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <b>
                      {m?.name ?? "Machine"} · {MAINTENANCE_KINDS[j.kind].label}
                    </b>
                    <span>{j.description}</span>
                    <span className="text-[12px] opacity-70">
                      Since {formatDateTime(j.started_at)} · {formatDuration(downtimeMinutes([{ ...j, stopped_machine: true }], j.started_at, now))}
                      {j.stopped_machine ? " stopped" : " (machine running)"}
                      {j.done_by ? ` · ${j.done_by}` : ""}
                    </span>
                  </div>
                  <FinishJobDialog id={j.id} title={m?.name ?? "job"} nowLocal={nowLocal} />
                </div>
              );
            })}
          </section>
        )}

        {MACHINE_SECTIONS.map((s) => {
          const rows = machinesInOrder(machines, s.category);
          return (
            <section key={s.category} className="flex flex-col gap-2">
              <SectionHead title={`${s.no} · ${s.title}`} aside={s.sub} />
              {rows.length === 0 && <p className="m-0 py-2 text-[13px] opacity-60">No machines in this section.</p>}
              {rows.map(({ machine: m, child }) => {
                const st = MACHINE_STATUS[m.status];
                const mine = logsOf(m.id);
                const openJob = open.find((j) => j.machine_id === m.id);
                const due = nextServiceDue(m, mine, today);
                const last = mine.find((l) => l.finished_at);
                const week = downtimeMinutes(mine, weekStart, now);
                return (
                  <div
                    key={m.id}
                    className={`grid items-start gap-x-4 gap-y-1 border-b border-divider py-3 text-[13px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] ${child ? "pl-6 lg:pl-8" : ""}`}
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <b className={child ? "text-[14px]" : "text-[16px]"}>
                        {child && <span aria-hidden="true" className="mr-1.5 opacity-50">└</span>}
                        {m.name}
                      </b>
                      <span className="flex flex-wrap items-center gap-2">
                        <Pill style={st.style}>{st.label}</Pill>
                        <span className="opacity-60">since {formatDate(m.status_since)}</span>
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {m.status_note && <span className="font-semibold">{m.status_note}</span>}
                      {openJob && (
                        <span className={openJob.stopped_machine ? "font-extrabold text-accent-800" : ""}>
                          {MAINTENANCE_KINDS[openJob.kind].label}: {openJob.description}
                        </span>
                      )}
                      {last && (
                        <span className="opacity-70">
                          Last: {MAINTENANCE_KINDS[last.kind].label.toLowerCase()} {formatDate(last.finished_at)}
                        </span>
                      )}
                      {!m.status_note && !openJob && !last && <span className="opacity-50">No jobs logged yet</span>}
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className={week ? "" : "opacity-60"}>Downtime 7 days: {formatDuration(week)}</span>
                      {due && (
                        <span className={due.days < 0 ? "font-extrabold text-accent-800" : due.days <= 3 ? "font-extrabold" : "opacity-70"}>
                          Service {due.days < 0 ? `overdue ${-due.days} d` : due.days === 0 ? "due today" : `due ${formatDate(due.due)}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 lg:justify-end">
                      <LogJobDialog machines={machines} machineId={m.id} nowLocal={nowLocal} compact />
                      <MachineDialog machine={m} isAdmin={isAdmin} />
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}

        <section className="flex flex-col gap-3">
          <SectionHead title="Maintenance log">
            <div className="flex flex-wrap border border-divider text-[12px]">
              {[{ category: "", title: "All" }, ...MACHINE_SECTIONS].map((f) => (
                <Link
                  key={f.category || "all"}
                  href={f.category ? `/ops/maintenance?s=${f.category}` : "/ops/maintenance"}
                  className={`px-2.5 py-[5px] no-underline ${(section ?? "") === f.category ? "bg-text !text-bg" : "text-text hover:bg-text/[.07]"}`}
                >
                  {f.title}
                </Link>
              ))}
            </div>
          </SectionHead>
          {recent.length === 0 ? (
            <p className="m-0 py-2 text-[13px] opacity-60">Nothing logged yet. Use “Log a job” for breakdowns, repairs, planned services, cleaning and parts.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left font-mono text-[11px] tracking-[.08em] uppercase opacity-70">
                    <th className="py-2 pr-3 font-semibold">Started</th>
                    <th className="py-2 pr-3 font-semibold">Machine</th>
                    <th className="py-2 pr-3 font-semibold">Job</th>
                    <th className="py-2 pr-3 font-semibold">What</th>
                    <th className="py-2 pr-3 font-semibold">Took</th>
                    <th className="py-2 pr-3 font-semibold">By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((l) => (
                    <tr key={l.id} className="border-t border-divider align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(l.started_at)}</td>
                      <td className="py-2 pr-3 font-semibold">{byId.get(l.machine_id)?.name ?? "-"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{MAINTENANCE_KINDS[l.kind].label}</td>
                      <td className="py-2 pr-3">
                        {l.description}
                        {l.parts && <span className="block opacity-70">Parts: {l.parts}</span>}
                        {l.notes && <span className="block whitespace-pre-line opacity-70">{l.notes}</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {l.finished_at ? formatDuration(downtimeMinutes([{ ...l, stopped_machine: true }], l.started_at, l.finished_at)) : <b className="text-accent-800">going on</b>}
                        {l.stopped_machine && <span className="block text-[11px] opacity-70">stopped</span>}
                      </td>
                      <td className="py-2 pr-3">{l.done_by ?? ""}</td>
                      <td className="py-2 text-right">
                        <DeleteJobButton id={l.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

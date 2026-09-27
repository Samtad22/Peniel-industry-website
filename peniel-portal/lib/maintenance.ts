// Maintenance (supabase/migrations/20261014000001_maintenance.sql): the plant's
// machines in four sections, their status, and the maintenance log.
// INTERNAL ONLY: machine names never reach customers (CLAUDE.md rule 2).
// Pure (no server imports) so it can be unit-tested.

import type { CSSProperties } from "react";

export type MachineCategory = "ctp" | "printing" | "coating_oven" | "press";
export type MachineStatus = "running" | "down" | "idle" | "on_order";
export type MaintenanceKind = "breakdown" | "repair" | "preventive" | "cleaning" | "parts" | "inspection";

/** The four sections, in process order. */
export const MACHINE_SECTIONS: { category: MachineCategory; no: string; title: string; sub: string }[] = [
  { category: "ctp", no: "01", title: "CTP", sub: "The CTP machine, its plate developer and its plate oven." },
  { category: "printing", no: "02", title: "Printing", sub: "The two-unit roller printing machine and its UV dryer." },
  { category: "coating_oven", no: "03", title: "Coating oven", sub: "The big LPG oven: white base coat, varnish and lacquer." },
  { category: "press", no: "04", title: "Presses and liners", sub: "Each press with its two liners." },
];

export const MACHINE_STATUS: Record<MachineStatus, { label: string; style: CSSProperties }> = {
  running: { label: "● Running", style: { background: "var(--color-text)", color: "var(--color-bg)" } },
  down: { label: "■ Down", style: { background: "var(--color-accent)", color: "var(--color-bg)", fontWeight: 800 } },
  idle: { label: "Idle", style: { borderColor: "var(--color-text)" } },
  on_order: { label: "On the way", style: { border: "1px dashed var(--color-neutral-600)", color: "var(--color-neutral-800)" } },
};

export const MAINTENANCE_KINDS: Record<MaintenanceKind, { label: string; stops: boolean }> = {
  breakdown: { label: "Breakdown", stops: true },
  repair: { label: "Repair", stops: true },
  preventive: { label: "Planned service", stops: true },
  cleaning: { label: "Cleaning", stops: false },
  parts: { label: "Part replaced", stops: false },
  inspection: { label: "Inspection", stops: false },
};

export type Machine = {
  id: string;
  code: string;
  name: string;
  category: MachineCategory;
  parent_id: string | null;
  sort_order: number;
  status: MachineStatus;
  status_note: string | null;
  status_since: string;
  service_every_days: number | null;
};

export type MaintenanceLog = {
  id: string;
  machine_id: string;
  kind: MaintenanceKind;
  started_at: string;
  finished_at: string | null;
  stopped_machine: boolean;
  description: string;
  parts: string | null;
  done_by: string | null;
  notes: string | null;
};

/** Minutes a job stopped its machine within [from, to) (ongoing jobs count up to `to`). */
export function downtimeMinutes(logs: Pick<MaintenanceLog, "started_at" | "finished_at" | "stopped_machine">[], from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  let ms = 0;
  for (const l of logs) {
    if (!l.stopped_machine) continue;
    const s = Math.max(a, new Date(l.started_at).getTime());
    const e = Math.min(b, l.finished_at ? new Date(l.finished_at).getTime() : b);
    if (e > s) ms += e - s;
  }
  return Math.round(ms / 60_000);
}

/** `45 min`, `3 h 20 min`, `2 d 4 h`. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return `${d} d${h ? ` ${h} h` : ""}`;
}

/**
 * When a machine's next planned service is due: its last planned service plus
 * its interval (never serviced: due now). Null when it has no interval or
 * isn't installed yet.
 */
export function nextServiceDue(
  machine: Pick<Machine, "service_every_days" | "status">,
  logs: Pick<MaintenanceLog, "kind" | "started_at" | "finished_at">[],
  today: string,
): { due: string; days: number } | null {
  if (!machine.service_every_days || machine.status === "on_order") return null;
  const last = logs
    .filter((l) => l.kind === "preventive" && l.finished_at)
    .map((l) => l.finished_at!.slice(0, 10))
    .sort()
    .pop();
  const due = last ? addDaysIso(last, machine.service_every_days) : today;
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { due, days };
}

const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Machines of a section in order, each press followed by its liners. */
export function machinesInOrder(machines: Machine[], category: MachineCategory): { machine: Machine; child: boolean }[] {
  const mine = machines.filter((m) => m.category === category).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const ids = new Set(mine.map((m) => m.id));
  const tops = mine.filter((m) => !m.parent_id || !ids.has(m.parent_id));
  return tops.flatMap((t) => [{ machine: t, child: false }, ...mine.filter((m) => m.parent_id === t.id).map((m) => ({ machine: m, child: true }))]);
}

"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisLocalToIso } from "@/lib/inventory";
import { MAINTENANCE_KINDS, MACHINE_SECTIONS, MACHINE_STATUS, type MachineCategory, type MachineStatus, type MaintenanceKind } from "@/lib/maintenance";
import { createClient } from "@/lib/supabase/server";

export type MaintState = { error?: string; ok?: string } | null;

/** Admin and production keep the maintenance log (RLS enforces the same). */
const WRITERS = ["admin", "production"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

function refresh() {
  revalidatePath("/ops/maintenance");
  revalidatePath("/ops/reports/eod");
}

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** Log a maintenance job or breakdown on one machine (still going on, or already done). */
export async function logMaintenance(_prev: MaintState, fd: FormData): Promise<MaintState> {
  await requireStaff([...WRITERS]);
  const machineId = text(fd, "machine_id", 40);
  const kind = text(fd, "kind", 20) as MaintenanceKind;
  const description = text(fd, "description", 1000);
  if (!UUID.test(machineId)) return { error: "Choose the machine." };
  if (!(kind in MAINTENANCE_KINDS)) return { error: "Choose what kind of job it is." };
  if (!description) return { error: "Describe the problem or the work done." };
  const started = addisLocalToIso(text(fd, "started_at", 20));
  if (!started) return { error: "Enter when it started." };
  if (started > new Date(Date.now() + 5 * 60_000).toISOString()) return { error: "It can't start in the future." };
  const ongoing = fd.get("ongoing") === "on";
  const finished = ongoing ? null : addisLocalToIso(text(fd, "finished_at", 20));
  if (!ongoing && !finished) return { error: "Enter when it finished, or tick “Still going on”." };
  if (finished && finished < started) return { error: "It can't finish before it started." };

  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_logs").insert({
    machine_id: machineId,
    kind,
    started_at: started,
    finished_at: finished,
    stopped_machine: fd.get("stopped_machine") === "on",
    description,
    parts: text(fd, "parts", 500) || null,
    done_by: text(fd, "done_by", 120) || null,
    notes: text(fd, "notes", 1000) || null,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't log maintenance." : "Couldn't save. Please try again." };
  refresh();
  return { ok: ongoing && fd.get("stopped_machine") === "on" ? "Logged. The machine shows as down until the job is finished." : "Logged." };
}

/** Finish a job that was still going on (a stopped machine then shows as running). */
export async function finishMaintenance(_prev: MaintState, fd: FormData): Promise<MaintState> {
  await requireStaff([...WRITERS]);
  const id = text(fd, "id", 40);
  if (!UUID.test(id)) return { error: "Something went wrong. Reload the page." };
  const finished = addisLocalToIso(text(fd, "finished_at", 20));
  if (!finished) return { error: "Enter when it finished." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("maintenance_logs").select("started_at, notes, parts").eq("id", id).maybeSingle<{ started_at: string; notes: string | null; parts: string | null }>();
  if (!job) return { error: "That job wasn't found." };
  if (finished < job.started_at) return { error: "It can't finish before it started." };
  const done = text(fd, "done", 600);
  const parts = text(fd, "parts", 500);
  const { error } = await supabase
    .from("maintenance_logs")
    .update({
      finished_at: finished,
      notes: done ? [job.notes, `Done: ${done}`].filter(Boolean).join("\n").slice(0, 1000) : job.notes,
      parts: parts ? [job.parts, parts].filter(Boolean).join("; ").slice(0, 500) : job.parts,
      done_by: text(fd, "done_by", 120) || undefined,
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save. Please try again." };
  refresh();
  return { ok: "Finished." };
}

/** Remove a job logged by mistake. */
export async function deleteMaintenance(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = text(fd, "id", 40);
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("maintenance_logs").delete().eq("id", id);
  refresh();
}

/** Set a machine's status by hand (e.g. idle, on the way) with a short note, and its service interval. */
export async function updateMachine(_prev: MaintState, fd: FormData): Promise<MaintState> {
  const me = await requireStaff([...WRITERS]);
  const id = text(fd, "id", 40);
  const status = text(fd, "status", 20) as MachineStatus;
  if (!UUID.test(id)) return { error: "Something went wrong. Reload the page." };
  if (!(status in MACHINE_STATUS)) return { error: "Choose the status." };
  const every = text(fd, "service_every_days", 5);
  const days = every ? Number(every) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) return { error: "Service every: whole days, 1 to 730, or leave it empty." };
  const update: Record<string, unknown> = { status, status_note: text(fd, "status_note", 200) || null, service_every_days: days };
  const name = text(fd, "name", 80);
  if (me.role === "admin" && name) update.name = name;
  const supabase = await createClient();
  const { error } = await supabase.from("machines").update(update).eq("id", id);
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't change machines." : "Couldn't save. Please try again." };
  refresh();
  return { ok: "Saved." };
}

/** Add a machine (admin only), e.g. when Press 3 or new equipment arrives. */
export async function addMachine(_prev: MaintState, fd: FormData): Promise<MaintState> {
  await requireStaff(["admin"]);
  const name = text(fd, "name", 80);
  const category = text(fd, "category", 20) as MachineCategory;
  const parentId = text(fd, "parent_id", 40);
  const status = (text(fd, "status", 20) || "running") as MachineStatus;
  if (!name) return { error: "Enter the machine's name." };
  if (!MACHINE_SECTIONS.some((s) => s.category === category)) return { error: "Choose the section." };
  if (parentId && !UUID.test(parentId)) return { error: "Choose the press it belongs to." };
  if (!(status in MACHINE_STATUS)) return { error: "Choose the status." };
  const code = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "machine"}-${crypto.randomUUID().slice(0, 6)}`;
  const supabase = await createClient();
  const { error } = await supabase.from("machines").insert({ code, name, category, parent_id: parentId || null, status, sort_order: 100 });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Only admin adds machines." : "Couldn't add the machine. Please try again." };
  refresh();
  return { ok: `${name} added.` };
}

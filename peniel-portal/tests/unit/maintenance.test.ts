import { test } from "node:test";
import assert from "node:assert/strict";
import { downtimeMinutes, formatDuration, machinesInOrder, nextServiceDue, type Machine } from "../../lib/maintenance.ts";

test("downtime counts only stopping jobs, clipped to the period; ongoing jobs count up to its end", () => {
  const logs = [
    { started_at: "2026-09-27T05:00:00Z", finished_at: "2026-09-27T06:30:00Z", stopped_machine: true },
    { started_at: "2026-09-26T20:00:00Z", finished_at: "2026-09-27T01:00:00Z", stopped_machine: true },
    { started_at: "2026-09-27T07:00:00Z", finished_at: "2026-09-27T08:00:00Z", stopped_machine: false },
    { started_at: "2026-09-27T20:00:00Z", finished_at: null, stopped_machine: true },
  ];
  // Day in Addis: 26 Sep 21:00Z to 27 Sep 21:00Z.
  assert.equal(downtimeMinutes(logs, "2026-09-26T21:00:00Z", "2026-09-27T21:00:00Z"), 90 + 240 + 60);
});

test("durations read naturally", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(200), "3 h 20 min");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(52 * 60), "2 d 4 h");
});

test("next planned service: last service plus the interval; never serviced is due now", () => {
  const m = { service_every_days: 30, status: "running" as const };
  assert.deepEqual(nextServiceDue(m, [], "2026-09-27"), { due: "2026-09-27", days: 0 });
  const logs = [
    { kind: "preventive" as const, started_at: "2026-09-01T06:00:00Z", finished_at: "2026-09-01T09:00:00Z" },
    { kind: "cleaning" as const, started_at: "2026-09-20T06:00:00Z", finished_at: "2026-09-20T07:00:00Z" },
  ];
  assert.deepEqual(nextServiceDue(m, logs, "2026-09-27"), { due: "2026-10-01", days: 4 });
  assert.deepEqual(nextServiceDue(m, logs, "2026-10-05"), { due: "2026-10-01", days: -4 });
  assert.equal(nextServiceDue({ service_every_days: null, status: "running" }, logs, "2026-09-27"), null);
  assert.equal(nextServiceDue({ service_every_days: 30, status: "on_order" }, [], "2026-09-27"), null);
});

test("each press is followed by its liners", () => {
  const mk = (id: string, sort: number, parent: string | null = null): Machine => ({
    id, code: id, name: id, category: "press", parent_id: parent, sort_order: sort, status: "running", status_note: null, status_since: "", service_every_days: null,
  });
  const order = machinesInOrder([mk("l2a", 21, "p2"), mk("p1", 10), mk("p2", 20), mk("l1b", 12, "p1"), mk("l1a", 11, "p1")], "press");
  assert.deepEqual(order.map((o) => `${o.child ? "  " : ""}${o.machine.id}`), ["p1", "  l1a", "  l1b", "p2", "  l2a"]);
});

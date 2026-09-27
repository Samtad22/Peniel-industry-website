import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySubject, changedFields, changedValues, describeActivity, type ActivityRow } from "../../lib/activity.ts";

const row = (r: Partial<ActivityRow>): ActivityRow => ({ id: 1, actor: null, action: "updated", entity: "orders", entity_id: "x", before: null, after: null, created_at: "2026-09-27T08:00:00Z", ...r });

test("changedFields skips noise and unchanged fields", () => {
  assert.deepEqual(changedFields({ a: 1, updated_at: "1", reject_qty: 2 }, { a: 1, updated_at: "2", reject_qty: 3 }), ["reject quantity"]);
  assert.deepEqual(changedFields(null, { a: 1 }), []);
});

test("subjects name the record", () => {
  assert.equal(activitySubject(row({ entity: "qc_inspections", after: { batch_no: "12" } })), "batch 12");
  assert.equal(activitySubject(row({ entity: "portal_settings", after: { key: "plant" } })), "Plant defaults");
  assert.equal(activitySubject(row({ entity: "orders", after: { order_no: "PN-26-0001" } })), "PN-26-0001");
});

test("actions read in plain words", () => {
  assert.equal(describeActivity(row({ action: "created", entity: "print_runs" })).what, "added");
  assert.equal(describeActivity(row({ action: "release", entity: "qc_inspections" })).what, "released");
  const d = describeActivity(row({ action: "status:in_production", before: { status: "scheduled", po_number: "1" }, after: { status: "in_production", po_number: "2" } }));
  assert.equal(d.what, "status → in production");
  assert.equal(d.detail, "Changed: po number");
  assert.equal(describeActivity(row({ entity: "hold_reason_presets", action: "deleted" })).thing, "Reason preset");
});

test("a setting's change names the keys inside it", () => {
  const v = changedValues({ key: "plant", value: { oven_minutes: 30, stillage_sheets: 1410 } }, { key: "plant", value: { oven_minutes: 32, stillage_sheets: 1410 } });
  assert.deepEqual(v, [{ field: "oven minutes", from: "30", to: "32" }]);
});

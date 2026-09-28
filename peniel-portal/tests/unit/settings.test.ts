import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, emailGroupOf, linerPerHour, linerPerShift, mergeSettings } from "../../lib/settings.ts";

test("settings: stored values over the defaults, anything odd falls back", () => {
  assert.deepEqual(mergeSettings([]), DEFAULT_SETTINGS);
  const s = mergeSettings([
    { key: "plant", value: { reject_limit_pct: 0.6, oven_minutes: "35", stillage_sheets: 99999 } },
    { key: "coa", value: { tel: " +251 11 000 0000 ", revision: "" } },
    { key: "emails_off", value: ["reports", "nonsense"] },
    { key: "report_recipients", value: ["not-an-id", "11111111-1111-4111-8111-111111111111"] },
  ]);
  assert.equal(s.plant.reject_limit_pct, 0.6);
  assert.equal(s.plant.oven_minutes, 35);
  assert.equal(s.plant.stillage_sheets, 1410, "out of range");
  assert.equal(s.plant.press_per_hour, 270000, "missing keeps the default");
  assert.equal(linerPerHour(s.plant), 135000);
  assert.equal(linerPerShift(s.plant), 1080000);
  assert.equal(s.coa.tel, "+251 11 000 0000");
  assert.equal(s.coa.revision, "006", "empty keeps the default");
  assert.deepEqual(s.emails_off, ["reports"]);
  assert.deepEqual(s.report_recipients, ["11111111-1111-4111-8111-111111111111"]);
});

test("each email kind belongs to its group", () => {
  assert.equal(emailGroupOf("order_confirmed"), "customer_orders");
  assert.equal(emailGroupOf("order_on_hold_date"), "customer_orders");
  assert.equal(emailGroupOf("order_submitted"), "staff_orders");
  assert.equal(emailGroupOf("order_cancelled"), "staff_orders");
  assert.equal(emailGroupOf("certificate_ready"), "customer_documents");
  assert.equal(emailGroupOf("proof_approved"), "staff_artwork");
  assert.equal(emailGroupOf("proof_sent"), "customer_artwork");
  assert.equal(emailGroupOf("eod_report"), "reports");
  assert.equal(emailGroupOf("test"), null);
});

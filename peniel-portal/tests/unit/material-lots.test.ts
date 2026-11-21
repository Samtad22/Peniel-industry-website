import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, expiryState, lotStock, type MaterialLot } from "../../lib/material-lots.ts";

const lot = (id: string, quantity: number, received_on: string | null, expires_on: string | null, produced_on: string | null = null): MaterialLot => ({
  id,
  quantity,
  received_on,
  produced_on,
  expires_on,
  lot_no: null,
  notes: null,
});

test("stock on hand is the newest deliveries; the oldest went first", () => {
  // Adhesive remover: 60 kg from 2025 (expired Apr 2026), 60 kg from Nov 2026; 98 kg on hand.
  const s = lotStock(98, [lot("old", 60, "2025-10-24", "2026-04-01"), lot("new", 60, "2026-11-11", "2027-07-13")], "2026-11-21");
  assert.deepEqual(
    s.lots.map((l) => [l.id, l.inStock]),
    [
      ["new", 60],
      ["old", 38],
    ],
  );
  assert.equal(s.expired, 38);
  assert.equal(s.expiredSince, "2026-04-01");
  assert.deepEqual(s.next, { date: "2027-07-13", quantity: 60 });
  assert.equal(s.undated, 0);
  assert.equal(expiryState(s, "2026-11-21"), "expired");
});

test("all of it in the newest delivery: nothing expired", () => {
  const s = lotStock(45, [lot("old", 90, "2025-10-24", "2026-04-14"), lot("new", 60, "2026-11-11", "2027-07-13")], "2026-11-21");
  assert.deepEqual(s.lots.map((l) => l.id), ["new"]);
  assert.equal(s.expired, 0);
  assert.equal(expiryState(s, "2026-11-21"), "ok");
  assert.equal(expiryState(s, "2027-06-01"), "soon");
});

test("more on hand than the deliveries recorded: the rest has no dates", () => {
  const s = lotStock(100, [lot("a", 30, "2026-01-01", null)], "2026-11-21");
  assert.equal(s.undated, 70);
  assert.equal(s.next, null);
  assert.equal(expiryState(s, "2026-11-21"), "undated");
  assert.deepEqual(lotStock(0, [lot("a", 30, "2026-01-01", "2025-01-01")], "2026-11-21").lots, []);
  assert.equal(lotStock(-5, [], "2026-11-21").undated, 0);
});

test("days between two dates", () => {
  assert.equal(daysBetween("2026-11-21", "2027-01-20"), 60);
  assert.equal(daysBetween("2026-11-21", "2026-11-20"), -1);
});

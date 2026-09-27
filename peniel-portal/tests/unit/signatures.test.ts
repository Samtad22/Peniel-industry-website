import { test } from "node:test";
import assert from "node:assert/strict";
import { isSignatureImage, MAX_SIGNATURE_CHARS, signing, type Signature } from "../../lib/signatures.ts";

const sig = (signer_id: string): Signature => ({ name: signer_id, image: "data:image/png;base64,AA==", signed_at: "2026-09-27T08:00:00Z", signer_id });
const qc = { userId: "qc", role: "quality" };
const boss = { userId: "boss", role: "admin" };

test("a signature is a PNG data URL of a sensible size", () => {
  assert.equal(isSignatureImage("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isSignatureImage("data:image/jpeg;base64,iVBORw0KGgo="), false);
  assert.equal(isSignatureImage("data:image/png;base64,<script>"), false);
  assert.equal(isSignatureImage(`data:image/png;base64,${"A".repeat(MAX_SIGNATURE_CHARS)}`), false);
});

test("prepared by first, then approved by someone else on a released batch", () => {
  let s = signing({}, true, qc);
  assert.equal(s.prepared.canSign, true);
  assert.equal(s.approved.canSign, false);
  assert.match(s.approved.blocked ?? "", /Prepared by/);

  s = signing({ prepared: sig("qc") }, true, qc);
  assert.equal(s.prepared.canSign, false);
  assert.equal(s.prepared.canRemove, true);
  assert.match(s.approved.blocked ?? "", /different person/);

  s = signing({ prepared: sig("qc") }, true, boss);
  assert.equal(s.approved.canSign, true);
  assert.equal(s.prepared.canRemove, true, "admin can remove any signature");

  s = signing({ prepared: sig("qc") }, false, boss);
  assert.match(s.approved.blocked ?? "", /released/);
});

test("approved by comes off before prepared by; others see nothing to do", () => {
  const both = { prepared: sig("qc"), approved: sig("boss") };
  assert.equal(signing(both, true, qc).prepared.canRemove, false);
  assert.equal(signing(both, true, qc).approved.canRemove, false, "not someone else's");
  assert.equal(signing(both, true, boss).approved.canRemove, true);
  const sales = signing({}, true, { userId: "s", role: "sales" });
  assert.deepEqual(sales.prepared, { canSign: false, blocked: null, canRemove: false });
  assert.deepEqual(sales.approved, { canSign: false, blocked: null, canRemove: false });
});

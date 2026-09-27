import { test } from "node:test";
import assert from "node:assert/strict";
import { isSignatureImage, MAX_SIGNATURE_CHARS, signing, type Signature } from "../../lib/signatures.ts";

const sig = (signer_id: string): Signature => ({ name: signer_id, image: "data:image/png;base64,AA==", signed_at: "2026-09-27T08:00:00Z", signer_id });
const manager = { userId: "tsegaw", role: "quality" };
const inspector = { userId: "qc", role: "quality" };
const admin = { userId: "boss", role: "admin" };

test("a signature is a PNG data URL of a sensible size", () => {
  assert.equal(isSignatureImage("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(isSignatureImage("data:image/jpeg;base64,iVBORw0KGgo="), false);
  assert.equal(isSignatureImage("data:image/png;base64,<script>"), false);
  assert.equal(isSignatureImage(`data:image/png;base64,${"A".repeat(MAX_SIGNATURE_CHARS)}`), false);
});

test("one signature, prepared by quality or admin; admin can remove any", () => {
  assert.deepEqual(signing({}, manager), { canSign: true, canRemove: false });
  assert.deepEqual(signing({}, admin), { canSign: true, canRemove: false });
  assert.deepEqual(signing({}, { userId: "s", role: "sales" }), { canSign: false, canRemove: false });
  const signed = { prepared: sig("tsegaw") };
  assert.deepEqual(signing(signed, manager), { canSign: false, canRemove: true });
  assert.deepEqual(signing(signed, inspector), { canSign: false, canRemove: false }, "not someone else's");
  assert.deepEqual(signing(signed, admin), { canSign: false, canRemove: true });
});

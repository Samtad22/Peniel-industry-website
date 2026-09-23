import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../lib/safe-next.ts";

test("keeps relative paths", () => {
  assert.equal(safeNext("/orders?id=1"), "/orders?id=1");
});

test("rejects anything that could leave the site", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", null, undefined, 42]) {
    assert.equal(safeNext(bad), "/");
  }
});

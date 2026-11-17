import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCmyk, parseSeparationsText, platesLabel, separationHex, separationsOf, separationsText } from "../../lib/separations.ts";

test("CMYK specs become screen swatches; white bases are white", () => {
  assert.deepEqual(parseCmyk("C85 M0 Y100 K30"), { c: 85, m: 0, y: 100, k: 30 });
  assert.equal(parseCmyk("White · opaque base"), null);
  assert.equal(parseCmyk("C101 M0 Y0 K0"), null);
  assert.equal(separationHex({ name: "Coke Red", spec: "C0 M100 Y100 K0" }), "#ff0000");
  assert.equal(separationHex({ name: "Black", spec: "C0 M0 Y0 K100" }), "#000000");
  assert.equal(separationHex({ name: "White (enamel)", spec: "White · opaque base" }), "#ffffff");
  assert.equal(separationHex({ name: "Spot", spec: "" }), null);
});

test("separations as lines to edit, and back", () => {
  const seps = [
    { name: "Heineken Green", spec: "C85 M0 Y100 K30" },
    { name: "White (enamel)", spec: "White · opaque base" },
    { name: "Spot Gold", spec: "" },
  ];
  const text = separationsText(seps);
  assert.equal(text, "Heineken Green | C85 M0 Y100 K30\nWhite (enamel) | White · opaque base\nSpot Gold");
  assert.deepEqual(parseSeparationsText(text + "\n\n  \n"), seps);
  assert.equal(parseSeparationsText(Array.from({ length: 20 }, (_, i) => `Ink ${i}`).join("\n")).length, 12);
});

test("stored separations are cleaned; the plates label", () => {
  assert.deepEqual(separationsOf([{ name: " Red ", spec: "C0 M100 Y100 K0" }, { name: "" }, null]), [{ name: "Red", spec: "C0 M100 Y100 K0" }]);
  assert.deepEqual(separationsOf("nope"), []);
  assert.equal(platesLabel("HEI-01", 4), "HEI-01 · 4 plates");
  assert.equal(platesLabel(null, 1), "1 plate");
  assert.equal(platesLabel(null, null), "");
});

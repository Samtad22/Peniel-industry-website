import { test } from "node:test";
import assert from "node:assert/strict";
import { brandSlug, crownSizeLine, firstInkHex, formatInk, inkNames, pantoneHex, parseInk } from "../../lib/inks.ts";

test("parseInk reads the name and swatch", () => {
  assert.deepEqual(parseInk("PANTONE 485 C #da291c"), { name: "PANTONE 485 C", hex: "#DA291C" });
  assert.deepEqual(parseInk("Walia Gold #C2983F"), { name: "Walia Gold", hex: "#C2983F" });
  // older entries: a bare name or a bare hex
  assert.deepEqual(parseInk("#D52B1E"), { name: "#D52B1E", hex: "#D52B1E" });
  assert.deepEqual(parseInk("gold"), { name: "gold", hex: null });
  // a known Pantone without a hex gets its screen colour
  assert.deepEqual(parseInk("PMS 186 C"), { name: "PMS 186 C", hex: "#C8102E" });
});

test("formatInk round-trips", () => {
  for (const s of ["PANTONE 485 C #DA291C", "#D52B1E", "Special gold #BF975B"]) assert.equal(formatInk(parseInk(s)), s);
  assert.equal(formatInk({ name: "  White ", hex: "not a colour" }), "White");
  assert.equal(formatInk({ name: "", hex: null }), "");
});

test("pantoneHex understands the ways Pantones are written", () => {
  assert.equal(pantoneHex("PANTONE 485 C"), "#DA291C");
  assert.equal(pantoneHex("pms 485c"), "#DA291C");
  assert.equal(pantoneHex("P2728C"), "#0047BB");
  assert.equal(pantoneHex("Pantone Black C"), "#2D2926");
  assert.equal(pantoneHex("PANTONE Cool Gray 5 C"), "#B1B3B3");
  assert.equal(pantoneHex("White enamel"), "#FFFFFF");
  assert.equal(pantoneHex("PANTONE 9999 C"), null);
  assert.equal(pantoneHex("Pink"), null);
});

test("first swatch and names", () => {
  const c = ["Gold", "PANTONE 871 C #84754E", "White"];
  assert.equal(firstInkHex(c), "#84754E");
  assert.equal(firstInkHex([]), null);
  assert.equal(inkNames(c), "Gold, PANTONE 871 C, White");
});

test("crown size line", () => {
  assert.equal(crownSizeLine("26mm"), "26 mm crown · Ø 32.1 mm outside");
  assert.equal(crownSizeLine("26 mm"), "26 mm crown · Ø 32.1 mm outside");
  assert.equal(crownSizeLine("29mm"), "29 mm crown");
  assert.equal(crownSizeLine("Special"), "Special");
  assert.equal(crownSizeLine(""), "26 mm crown");
});

test("crown image files match brand names", () => {
  assert.equal(brandSlug("St. George"), "st-george");
  assert.equal(brandSlug("Sen'q"), "senq");
  assert.equal(brandSlug("Habesha Kostara Team"), "habesha-kostara-team");
  assert.equal(brandSlug("Coca-Cola"), "coca-cola");
  assert.equal(brandSlug("  Awaash Malt "), "awaash-malt");
});

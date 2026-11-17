// A brand's colour separations and CTP plates (internal, prepress): one
// plate per separation as a rule, from Peniel's Customer Artwork Catalogue
// (migration 20261118000002). Each separation is a name ("Heineken Green",
// "PANTONE 2252 C", "White (enamel)") and its print spec, usually CMYK
// ("C85 M0 Y100 K30"). No imports: used by forms, pages and unit tests.

export type Separation = { name: string; spec: string };

/** Most separations (and plates) a design has: the printer prints up to 6 colours in the catalogue. */
export const MAX_SEPARATIONS = 12;

/** The separations stored on a brand (jsonb), cleaned: names kept, empty ones dropped. */
export function separationsOf(raw: unknown): Separation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({ name: String((s as Separation)?.name ?? "").trim(), spec: String((s as Separation)?.spec ?? "").trim() }))
    .filter((s) => s.name)
    .slice(0, MAX_SEPARATIONS);
}

/** "C85 M0 Y100 K30" → { c: 85, m: 0, y: 100, k: 30 }; null when it isn't CMYK. */
export function parseCmyk(spec: string): { c: number; m: number; y: number; k: number } | null {
  const m = /C\s*(\d{1,3})\s*M\s*(\d{1,3})\s*Y\s*(\d{1,3})\s*K\s*(\d{1,3})/i.exec(spec);
  if (!m) return null;
  const [c, mm, y, k] = m.slice(1).map(Number);
  if ([c, mm, y, k].some((v) => v > 100)) return null;
  return { c, m: mm, y, k };
}

/** A swatch for the screen: from the CMYK, white for a white base, else null. */
export function separationHex(s: Separation): string | null {
  const cmyk = parseCmyk(s.spec);
  if (cmyk) {
    const ch = (v: number) =>
      Math.round(255 * (1 - v / 100) * (1 - cmyk.k / 100))
        .toString(16)
        .padStart(2, "0");
    return `#${ch(cmyk.c)}${ch(cmyk.m)}${ch(cmyk.y)}`;
  }
  if (/white/i.test(`${s.name} ${s.spec}`)) return "#ffffff";
  return null;
}

/** The separations as lines to edit: "Heineken Green | C85 M0 Y100 K30". */
export const separationsText = (seps: Separation[]): string => seps.map((s) => (s.spec ? `${s.name} | ${s.spec}` : s.name)).join("\n");

/** Lines typed on the form back to separations ("name | spec" or just a name), up to the most a design has. */
export function parseSeparationsText(text: string): Separation[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [name, ...rest] = line.split("|");
      return { name: name.trim().slice(0, 80), spec: rest.join("|").trim().slice(0, 80) };
    })
    .filter((s) => s.name)
    .slice(0, MAX_SEPARATIONS);
}

/** "HEI-01 · 4 plates" / "4 plates" / "" */
export function platesLabel(designCode: string | null | undefined, plates: number | null | undefined): string {
  const p = plates ? `${plates} plate${plates === 1 ? "" : "s"}` : "";
  return [designCode, p].filter(Boolean).join(" · ");
}

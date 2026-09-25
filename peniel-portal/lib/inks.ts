// A brand's print colours ("inks"), stored in brands.colours as text:
// "PANTONE 485 C #DA291C" = the ink's name, then an optional #hex for the
// on-screen swatch. Older entries are a bare name ("Gold") or a bare #hex.
// Shared by the browser and the server; no imports.

export type Ink = { name: string; hex: string | null };

const HEX = /#([0-9a-f]{6})$/i;

/** "PANTONE 485 C #DA291C" → { name: "PANTONE 485 C", hex: "#DA291C" }. */
export function parseInk(entry: string): Ink {
  const s = entry.trim();
  const m = HEX.exec(s);
  const hex = m ? `#${m[1].toUpperCase()}` : null;
  const name = (m ? s.slice(0, m.index) : s).trim();
  return { name: name || (hex ?? ""), hex: hex ?? pantoneHex(name) };
}

export function parseInks(colours: string[] | null | undefined): Ink[] {
  return (colours ?? []).map(parseInk).filter((i) => i.name);
}

/** Back to the stored form: the name, then the swatch hex (a bare #hex stays a bare #hex). */
export function formatInk(ink: Ink): string {
  const name = ink.name.trim().slice(0, 60);
  const hex = ink.hex && /^#[0-9a-f]{6}$/i.test(ink.hex) ? ink.hex.toUpperCase() : null;
  if (!name) return hex ?? "";
  return hex && hex !== name ? `${name} ${hex}` : name;
}

/** First colour with a swatch: the plain crown drawn when a brand has no image. */
export function firstInkHex(colours: string[] | null | undefined): string | null {
  return parseInks(colours).find((i) => i.hex)?.hex ?? null;
}

/** The inks as one line of text: "PANTONE 485 C, PANTONE 2300 C, White". */
export function inkNames(colours: string[] | null | undefined): string {
  return parseInks(colours)
    .map((i) => i.name)
    .join(", ");
}

/**
 * Screen approximations of the Pantone solid-coated colours on Peniel's
 * customers' crowns, used when staff type a Pantone without a hex. Printed
 * colour is matched to the Pantone guide, not to these.
 */
const PANTONE: Record<string, string> = {
  "108": "#FEDB00",
  "116": "#FFCD00",
  "123": "#FFC72C",
  "186": "#C8102E",
  "228": "#890C58",
  "281": "#00205B",
  "286": "#0033A0",
  "420": "#C7C9C7",
  "464": "#8B5B29",
  "485": "#DA291C",
  "871": "#84754E",
  "872": "#85714D",
  "877": "#8A8D8F",
  "1245": "#C69214",
  "1655": "#FC4C02",
  "1815": "#7C2529",
  "2597": "#5C068C",
  "2728": "#0047BB",
  "2738": "#06038D",
  "2935": "#0057B8",
  "5455": "#BFCED6",
  "5473": "#115E67",
  "7408": "#F6BE00",
  "7443": "#DDDAE8",
  "7473": "#279989",
  "7477": "#244C5A",
  "7482": "#009A44",
  "7621": "#AB2328",
  "7625": "#E04E39",
  "BLACK": "#2D2926",
  "BLACK 4": "#31261D",
  "NEUTRAL BLACK": "#222223",
  "COOL GRAY 5": "#B1B3B3",
  "WHITE": "#FFFFFF",
};

/** "PANTONE 485 C", "PMS 485C", "P485C", "Pantone Black C" → a screen hex, when known. */
export function pantoneHex(name: string): string | null {
  const s = name.toUpperCase().replace(/\s+/g, " ").trim();
  if (s === "WHITE" || /^WHITE\b/.test(s)) return PANTONE.WHITE;
  const m = /^(?:PANTONE\+?|PMS|P)\s*(.+?)\s*C?$/.exec(s);
  if (!m) return null;
  const key = m[1].replace(/\s*C$/, "").trim();
  return PANTONE[key] ?? null;
}

/** "26mm" → "26 mm crown · Ø 32.1 mm outside". Other sizes are shown as entered. */
export function crownSizeLine(size: string | null | undefined): string {
  const s = (size ?? "").trim();
  const mm = /^(\d+(?:\.\d+)?)\s*mm$/i.exec(s);
  if (!mm) return s || "26 mm crown";
  return mm[1] === "26" ? "26 mm crown · Ø 32.1 mm outside" : `${mm[1]} mm crown`;
}

/** "St. George" → "st-george", "Sen'q" → "senq": how crown image files are named. */
export function brandSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

import { firstInkHex, parseInks } from "@/lib/inks";

/** First swatch colour of a brand, if it has one. */
export function crownColour(colours: string[] | null | undefined): string | null {
  return firstInkHex(colours);
}

/** The image URL for a brand's crown, or null when it has none on file. `v` changes when the image is replaced. */
export function crownSrc(brand: { id: string; crown_image_path?: string | null }): string | null {
  const path = brand.crown_image_path;
  if (!path) return null;
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h << 5) + h + path.charCodeAt(i)) >>> 0;
  return `/files/crowns/${brand.id}?inline=1&v=${h.toString(36)}`;
}

/** A brand's crown: its artwork when on file, else a circle in the brand's colour (ink when unknown). */
export default function Crown({
  colours,
  src,
  size = 44,
  alt = "",
}: {
  colours: string[] | null | undefined;
  src?: string | null;
  size?: number;
  alt?: string;
}) {
  const ring = `inset 0 0 0 ${Math.max(3, Math.round(size / 11))}px var(--color-neutral-600)`;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image can't cache it
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className="inline-block shrink-0 rounded-full bg-neutral-200 object-cover"
        style={{ width: size, height: size, boxShadow: "0 0 0 1px var(--color-divider)" }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: crownColour(colours) ?? "var(--color-text)", boxShadow: ring }}
    />
  );
}

/** The brand's print colours as swatches with their Pantone names. */
export function InkSwatches({ colours, compact }: { colours: string[] | null | undefined; compact?: boolean }) {
  const inks = parseInks(colours);
  if (!inks.length) return <span className="opacity-60">As on file</span>;
  return (
    <ul className={`m-0 flex list-none flex-wrap p-0 ${compact ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1.5"}`}>
      {inks.map((ink, i) => (
        <li key={`${ink.name}-${i}`} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-3.5 shrink-0 rounded-full"
            style={{
              background: ink.hex ?? "transparent",
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-text) 25%, transparent)",
              backgroundImage: ink.hex ? undefined : "repeating-linear-gradient(45deg, var(--color-divider) 0 2px, transparent 2px 4px)",
            }}
          />
          <span>{ink.name}</span>
        </li>
      ))}
    </ul>
  );
}

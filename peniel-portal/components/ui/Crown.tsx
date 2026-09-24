const HEX = /^#[0-9a-f]{6}$/i;

/** First hex colour of a brand, if it has one. */
export function crownColour(colours: string[] | null | undefined): string | null {
  return (colours ?? []).find((c) => HEX.test(c)) ?? null;
}

/** A crown drawn as a circle in the brand's colour (ink when unknown). */
export default function Crown({ colours, size = 44 }: { colours: string[] | null | undefined; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: crownColour(colours) ?? "var(--color-text)",
        boxShadow: `inset 0 0 0 ${Math.max(3, Math.round(size / 11))}px var(--color-neutral-600)`,
      }}
    />
  );
}

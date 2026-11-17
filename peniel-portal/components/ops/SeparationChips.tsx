import { platesLabel, separationHex, type Separation } from "@/lib/separations";

/**
 * A brand's CTP plates and colour separations (internal, prepress): "HEI-01 ·
 * 4 plates" and a chip per separation, numbered in print order, with its
 * swatch from the CMYK. `compact`: swatches only, names on hover.
 */
export default function SeparationChips({
  designCode,
  plates,
  separations,
  compact,
}: {
  designCode?: string | null;
  plates?: number | null;
  separations: Separation[];
  compact?: boolean;
}) {
  const label = platesLabel(designCode, plates ?? (separations.length || null));
  if (!label && separations.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {label && <b className="font-mono text-[11px] tracking-[.04em]">{label}</b>}
      {separations.map((s, i) => {
        const hex = separationHex(s);
        return (
          <span key={`${i}-${s.name}`} title={`${i + 1} · ${s.name}${s.spec ? ` · ${s.spec}` : ""}`} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block size-3.5 shrink-0 rounded-full"
              style={{
                background: hex ?? "repeating-linear-gradient(45deg, transparent 0 2px, currentColor 2px 3px)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)",
              }}
            />
            {!compact && (
              <span className="opacity-80">
                {i + 1} {s.name}
              </span>
            )}
          </span>
        );
      })}
      {compact && separations.length > 0 && <span className="sr-only">{separations.map((s) => s.name).join(", ")}</span>}
    </span>
  );
}

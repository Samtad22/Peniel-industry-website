import { COMPANY } from "@/lib/constants";

/**
 * Embedded Google Map for the verified facility location. Uses the
 * key-less "output=embed" share format rather than the Maps Embed API,
 * since no API key has been provisioned for this project — swap for the
 * Maps Embed API (with a key) if tighter styling control is needed later.
 */
export default function MapEmbed({ className = "" }: { className?: string }) {
  const { lat, lng } = COMPANY.coordinates;
  const src = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-black/10 shadow-sm ${className}`}
      style={{ aspectRatio: "16 / 7" }}
    >
      <iframe
        src={src}
        title={`Map location — ${COMPANY.addressLine}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-full w-full border-0 grayscale-[15%]"
      />
    </div>
  );
}

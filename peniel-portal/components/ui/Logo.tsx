import Image from "next/image";

export default function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/img/logo-icon.png" alt="" width={32} height={32} priority />
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-semibold text-ink">Peniel Industry</span>
        {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
      </span>
    </span>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode, MouseEventHandler } from "react";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler;
  showArrow?: boolean;
  className?: string;
};

export function PrimaryButton({ children, href, onClick, showArrow = true, className = "" }: ButtonProps) {
  const base =
    "inline-flex items-center gap-2 rounded-[10px] bg-orange px-6 py-3.5 font-semibold text-white shadow-[0_12px_24px_rgba(241,83,28,0.28)] transition-transform hover:-translate-y-0.5";
  if (href) {
    return (
      <Link href={href} className={`${base} ${className}`}>
        {children}
        {showArrow && <ArrowRight size={16} />}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} ${className}`}>
      {children}
      {showArrow && <ArrowRight size={16} />}
    </button>
  );
}

export function WhiteButton({ children, href, onClick, showArrow = true, className = "" }: ButtonProps) {
  const base =
    "inline-flex items-center gap-2 rounded-[10px] bg-white px-6 py-3.5 font-semibold text-orange-deep shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-0.5";
  if (href) {
    return (
      <Link href={href} className={`${base} ${className}`}>
        {children}
        {showArrow && <ArrowRight size={16} />}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} ${className}`}>
      {children}
      {showArrow && <ArrowRight size={16} />}
    </button>
  );
}

export function GhostButton({
  children,
  href,
  onClick,
  light = false,
  className = "",
}: ButtonProps & { light?: boolean }) {
  const base = light
    ? "inline-flex items-center gap-2 rounded-[10px] border-[1.5px] border-white/55 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-white/10"
    : "inline-flex items-center gap-2 rounded-[10px] border-[1.5px] border-steel px-6 py-3.5 font-semibold text-graphite transition-colors hover:bg-navy/5";
  if (href) {
    return (
      <Link href={href} className={`${base} ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} ${className}`}>
      {children}
    </button>
  );
}

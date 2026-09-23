import clsx from "clsx";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-graphite shadow-xs outline-none placeholder:text-steel focus:border-navy focus:ring-2 focus:ring-navy/15";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-navy text-white hover:bg-navy-deep",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-navy-tint",
        variant === "ghost" && "text-muted hover:bg-navy-tint hover:text-ink",
        className,
      )}
    />
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null | undefined }) {
  if (state?.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.ok}
      </p>
    );
  }
  return null;
}

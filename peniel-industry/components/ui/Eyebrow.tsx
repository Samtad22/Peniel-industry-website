export default function Eyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "onDark" | "onOrange";
}) {
  const color =
    tone === "onOrange" ? "text-navy" : tone === "onDark" ? "text-orange-light" : "text-orange";
  return (
    <p className={`mb-3.5 font-brandmono text-[12.5px] font-semibold uppercase tracking-[0.18em] ${color}`}>
      {children}
    </p>
  );
}

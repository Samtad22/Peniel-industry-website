function scallopWavePath(width: number, height: number, teeth = 21, amplitude = 6) {
  const pts: string[] = [];
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const theta = (i / steps) * Math.PI * (teeth / 3);
    const y = height / 2 + Math.sin(theta) * amplitude;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts;
}

export default function ScallopDivider({
  bg = "var(--color-porcelain)",
  accent = "var(--color-steel)",
}: {
  bg?: string;
  accent?: string;
}) {
  const w = 1440, h = 28;
  const pts = scallopWavePath(w, h);
  const path = `M${pts.join(" L")}`;
  return (
    <div aria-hidden="true" style={{ background: bg, lineHeight: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="28" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeOpacity="0.55" />
      </svg>
    </div>
  );
}

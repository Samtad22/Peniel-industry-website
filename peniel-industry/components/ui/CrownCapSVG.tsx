export default function CrownCapSVG({ size = 340 }: { size?: number }) {
  const teeth = 21;
  const cx = 200, cy = 200, rOuter = 168, rInner = 152, amp = 9;

  const n = teeth * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter + amp : rOuter - amp;
    pts.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
  }
  const startMid: [number, number] = [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2];
  let outerPath = `M ${startMid[0].toFixed(2)},${startMid[1].toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const mid: [number, number] = [(curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2];
    outerPath += `Q ${curr[0].toFixed(2)},${curr[1].toFixed(2)} ${mid[0].toFixed(2)},${mid[1].toFixed(2)} `;
  }
  outerPath += "Z";

  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      style={{ filter: "drop-shadow(0 30px 45px rgba(14,34,66,0.35))" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="capTop" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FF8C5A" />
          <stop offset="55%" stopColor="#F1531C" />
          <stop offset="100%" stopColor="#C43D10" />
        </radialGradient>
        <linearGradient id="capSkirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E7EBEF" />
          <stop offset="50%" stopColor="#B9C2CC" />
          <stop offset="100%" stopColor="#8A96A3" />
        </linearGradient>
      </defs>
      <path d={outerPath} fill="url(#capSkirt)" stroke="#7C8895" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={rInner - 6} fill="url(#capTop)" stroke="#C43D10" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={rInner - 30} fill="none" stroke="#FFD9AE" strokeOpacity="0.55" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={rInner - 46} fill="none" stroke="#FFD9AE" strokeOpacity="0.4" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={22} fill="#27438E" />
      <circle cx={cx} cy={cy} r={9} fill="#FAF9F6" />
    </svg>
  );
}

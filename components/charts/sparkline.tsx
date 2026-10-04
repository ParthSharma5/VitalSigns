// Tiny trend for stat tiles: de-emphasised line, latest point in the accent.
export function Sparkline({ values, width = 96, height = 28 }: { values: Array<number | null>; width?: number; height?: number }) {
  const present = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (present.length < 2) return null;
  const max = Math.max(...present.map(([, v]) => v));
  const min = Math.min(...present.map(([, v]) => v));
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const d = present.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const [li, lv] = present[present.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke="var(--axis)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(lv)} r="3" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  );
}

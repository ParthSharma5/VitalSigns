'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { METRIC_INFO, formatValue, type MetricName } from '@/lib/metrics';

type Point = { t: string; p75: number | null; n: number };

const HEIGHT = 168;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

function niceStep(max: number, ticks: number) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Single-series p75 line with the metric's "good" (and, when in range, "poor")
// boundaries drawn as reference lines. One metric per chart: their units differ,
// so they never share an axis.
export function TrendChart({ metric, points, hourly }: { metric: MetricName; points: Point[]; hourly: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const info = METRIC_INFO[metric];

  const geo = useMemo(() => {
    const values = points.map((p) => p.p75).filter((v): v is number => v != null);
    const dataMax = values.length ? Math.max(...values) : info.good;
    const step = niceStep(Math.max(dataMax * 1.1, info.good * 1.15), 4);
    const yMax = Math.ceil(Math.max(dataMax * 1.1, info.good * 1.15) / step) * step;
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const ticks: number[] = [];
    for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(v);

    // Break the line where a bucket has no data instead of bridging the gap.
    const segments: string[] = [];
    let current = '';
    points.forEach((p, i) => {
      if (p.p75 == null) {
        if (current) segments.push(current);
        current = '';
      } else {
        current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.p75).toFixed(1)}`;
      }
    });
    if (current) segments.push(current);
    return { x, y, ticks, yMax, segments, innerW };
  }, [points, width, info.good]);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('en', hourly ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(geo.innerW / 72))));
  const lastIdx = points.findLastIndex((p) => p.p75 != null);
  const activePoint = active != null ? points[active] : null;

  function pick(clientX: number, rect: DOMRect) {
    const rel = clientX - rect.left - PAD.left;
    const i = Math.round((rel / Math.max(1, geo.innerW)) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${info.long} p75 over time`}
          tabIndex={0}
          className="block touch-none outline-none focus-visible:outline-2 focus-visible:outline-accent rounded"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const dir = e.key === 'ArrowLeft' ? -1 : 1;
            setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? lastIdx) + dir)));
          }}
        >
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={PAD.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
                {metric === 'CLS' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}s` : `${v}ms`}
              </text>
            </g>
          ))}

          {[
            { v: info.good, label: 'good' },
            { v: info.poor, label: 'poor' },
          ]
            .filter((r) => r.v <= geo.yMax)
            .map((r) => (
              <g key={r.label}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geo.y(r.v)}
                  y2={geo.y(r.v)}
                  stroke={r.label === 'good' ? 'var(--good)' : 'var(--poor)'}
                  strokeOpacity="0.55"
                />
                <text x={width - PAD.right - 4} y={geo.y(r.v) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
                  {r.label === 'good' ? 'good ≤' : 'poor >'} {formatValue(metric, r.v)}
                </text>
              </g>
            ))}

          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.t} x={geo.x(i)} y={HEIGHT - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {fmtTime(p.t)}
              </text>
            ) : null,
          )}

          {geo.segments.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {active == null && lastIdx >= 0 && (
            <circle cx={geo.x(lastIdx)} cy={geo.y(points[lastIdx].p75!)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          )}

          {activePoint && (
            <g pointerEvents="none">
              <line x1={geo.x(active!)} x2={geo.x(active!)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--axis)" />
              {activePoint.p75 != null && (
                <circle cx={geo.x(active!)} cy={geo.y(activePoint.p75)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
              )}
            </g>
          )}
        </svg>
      )}

      {activePoint && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(geo.x(active!) - 70, 0), Math.max(0, width - 140)),
            width: 140,
          }}
        >
          <div className="text-sm font-semibold text-ink tabular">
            {activePoint.p75 != null ? formatValue(metric, activePoint.p75) : 'No data'}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-0.5 w-3 rounded bg-accent" aria-hidden="true" />
            p75 · {activePoint.n.toLocaleString()} samples
          </div>
          <div className="mt-0.5 text-muted">
            {new Date(activePoint.t).toLocaleString('en', hourly ? { weekday: 'short', hour: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  );
}

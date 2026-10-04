// Metric definitions shared by ingest, queries, alerts and the UI.
// Thresholds are Google's published Core Web Vitals boundaries, applied at p75.

export const CORE_METRICS = ['LCP', 'INP', 'CLS'] as const;
export const METRICS = [...CORE_METRICS, 'TTFB'] as const;
export type MetricName = (typeof METRICS)[number];
export type Rating = 'good' | 'needs-improvement' | 'poor';

export const METRIC_INFO: Record<
  MetricName,
  { label: string; long: string; good: number; poor: number; unit: 'ms' | ''; maxValid: number; minDelta: number }
> = {
  // maxValid drops absurd values (clock bugs, tabs left open for days).
  // minDelta is the smallest absolute change worth alerting on, so a jump from
  // 0.01 to 0.02 CLS is not reported as "100% worse".
  LCP: { label: 'LCP', long: 'Largest Contentful Paint', good: 2500, poor: 4000, unit: 'ms', maxValid: 60_000, minDelta: 150 },
  INP: { label: 'INP', long: 'Interaction to Next Paint', good: 200, poor: 500, unit: 'ms', maxValid: 60_000, minDelta: 30 },
  CLS: { label: 'CLS', long: 'Cumulative Layout Shift', good: 0.1, poor: 0.25, unit: '', maxValid: 100, minDelta: 0.02 },
  TTFB: { label: 'TTFB', long: 'Time to First Byte', good: 800, poor: 1800, unit: 'ms', maxValid: 60_000, minDelta: 100 },
};

export function isMetric(name: unknown): name is MetricName {
  return typeof name === 'string' && (METRICS as readonly string[]).includes(name);
}

export function rate(metric: MetricName, value: number): Rating {
  const { good, poor } = METRIC_INFO[metric];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

export function formatValue(metric: MetricName, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '–';
  if (metric === 'CLS') return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${Math.round(value)} ms`;
}

export const RATING_LABEL: Record<Rating, string> = {
  good: 'Good',
  'needs-improvement': 'Needs work',
  poor: 'Poor',
};

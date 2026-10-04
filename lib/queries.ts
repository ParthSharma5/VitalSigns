import { sql } from './db';
import { CORE_METRICS, METRICS, METRIC_INFO, type MetricName } from './metrics';
import type { Device } from './ingest';

export const RANGES = { '24h': 1, '7d': 7, '30d': 30 } as const;
export type RangeKey = keyof typeof RANGES;
export type DeviceFilter = Device | 'all';

export type Filter = { siteId: string; range: RangeKey; device: DeviceFilter; now?: Date };

function windowOf(f: Filter) {
  const now = f.now ?? new Date();
  const ms = RANGES[f.range] * 86_400_000;
  return { now, start: new Date(now.getTime() - ms), prevStart: new Date(now.getTime() - 2 * ms) };
}

const deviceClause = (param: string) => `(${param}::text IS NULL OR device = ${param})`;
const deviceParam = (f: Filter) => (f.device === 'all' ? null : f.device);

const NOT_GOOD = `CASE metric ${METRICS.map((m) => `WHEN '${m}' THEN value > ${METRIC_INFO[m].good}`).join(' ')} END`;
const POOR = `CASE metric ${METRICS.map((m) => `WHEN '${m}' THEN value > ${METRIC_INFO[m].poor}`).join(' ')} END`;

const P75 = 'percentile_cont(0.75) WITHIN GROUP (ORDER BY value)';

export type MetricSummary = {
  metric: MetricName;
  p75: number | null;
  prevP75: number | null;
  n: number;
  good: number;
  needsImprovement: number;
  poor: number;
};

export async function getSummary(f: Filter): Promise<{ metrics: Record<MetricName, MetricSummary>; views: number }> {
  const { start, prevStart, now } = windowOf(f);
  const rows = await sql<{
    metric: MetricName; p75: number | null; prev_p75: number | null; n: number; not_good: number; poor: number;
  }>(
    `SELECT metric,
       ${P75} FILTER (WHERE created_at >= $2) AS p75,
       ${P75} FILTER (WHERE created_at <  $2) AS prev_p75,
       count(*) FILTER (WHERE created_at >= $2)::int AS n,
       count(*) FILTER (WHERE created_at >= $2 AND ${NOT_GOOD})::int AS not_good,
       count(*) FILTER (WHERE created_at >= $2 AND ${POOR})::int AS poor
     FROM events
     WHERE site_id = $1 AND created_at >= $3 AND created_at < $4 AND ${deviceClause('$5')}
     GROUP BY metric`,
    [f.siteId, start, prevStart, now, deviceParam(f)],
  );
  const [{ views }] = await sql<{ views: number }>(
    `SELECT count(DISTINCT view_id)::int AS views FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND ${deviceClause('$4')}`,
    [f.siteId, start, now, deviceParam(f)],
  );

  const metrics = Object.fromEntries(
    METRICS.map((m) => [m, { metric: m, p75: null, prevP75: null, n: 0, good: 0, needsImprovement: 0, poor: 0 }]),
  ) as Record<MetricName, MetricSummary>;
  for (const r of rows) {
    if (!(r.metric in metrics)) continue;
    metrics[r.metric] = {
      metric: r.metric,
      p75: r.p75,
      prevP75: r.prev_p75,
      n: r.n,
      good: r.n - r.not_good,
      needsImprovement: r.not_good - r.poor,
      poor: r.poor,
    };
  }
  return { metrics, views };
}

export type TrendPoint = { t: string; p75: number | null; n: number };

export async function getTrends(f: Filter): Promise<Record<MetricName, TrendPoint[]>> {
  const { start, now } = windowOf(f);
  const unit = f.range === '24h' ? 'hour' : 'day';
  const rows = await sql<{ bucket: Date; metric: MetricName; p75: number; n: number }>(
    `SELECT date_trunc('${unit}', created_at) AS bucket, metric, ${P75} AS p75, count(*)::int AS n
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND ${deviceClause('$4')}
     GROUP BY 1, 2 ORDER BY 1`,
    [f.siteId, start, now, deviceParam(f)],
  );

  const step = unit === 'hour' ? 3_600_000 : 86_400_000;
  const first = Math.floor(start.getTime() / step) * step + step;
  const buckets: number[] = [];
  for (let t = first; t <= now.getTime(); t += step) buckets.push(t);

  const out = {} as Record<MetricName, TrendPoint[]>;
  for (const m of METRICS) {
    const byTime = new Map(rows.filter((r) => r.metric === m).map((r) => [new Date(r.bucket).getTime(), r]));
    out[m] = buckets.map((t) => {
      const r = byTime.get(t);
      return { t: new Date(t).toISOString(), p75: r ? r.p75 : null, n: r ? r.n : 0 };
    });
  }
  return out;
}

export type PageRow = { path: string; views: number } & Record<MetricName, number | null>;

export async function getPages(f: Filter, limit = 15): Promise<PageRow[]> {
  const { start, now } = windowOf(f);
  const rows = await sql<{ path: string; views: number } & Record<Lowercase<MetricName>, number | null>>(
    `SELECT path, count(DISTINCT view_id)::int AS views,
       ${METRICS.map((m) => `${P75} FILTER (WHERE metric = '${m}') AS ${m.toLowerCase()}`).join(',\n       ')}
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND ${deviceClause('$4')}
     GROUP BY path
     HAVING count(DISTINCT view_id) >= 3
     ORDER BY lcp DESC NULLS LAST
     LIMIT $5`,
    [f.siteId, start, now, deviceParam(f), limit],
  );
  return rows.map((r) => ({ path: r.path, views: r.views, LCP: r.lcp, INP: r.inp, CLS: r.cls, TTFB: r.ttfb }));
}

export type BreakdownRow = { key: string; views: number } & Record<MetricName, number | null>;

export async function getBreakdown(f: Filter, dim: 'device' | 'country', limit = 12): Promise<BreakdownRow[]> {
  const { start, now } = windowOf(f);
  const col = dim === 'device' ? 'device' : `coalesce(country, '??')`;
  const rows = await sql<{ key: string; views: number } & Record<Lowercase<MetricName>, number | null>>(
    `SELECT ${col} AS key, count(DISTINCT view_id)::int AS views,
       ${METRICS.map((m) => `${P75} FILTER (WHERE metric = '${m}') AS ${m.toLowerCase()}`).join(',\n       ')}
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND ${deviceClause('$4')}
     GROUP BY 1 ORDER BY views DESC LIMIT $5`,
    [f.siteId, start, now, deviceParam(f), limit],
  );
  return rows.map((r) => ({ key: r.key, views: r.views, LCP: r.lcp, INP: r.inp, CLS: r.cls, TTFB: r.ttfb }));
}

export type Culprit = { target: string | null; resource: string | null; eventType: string | null; share: number };
export type PageDiagnostics = {
  path: string;
  views: number;
  p75: Record<MetricName, number | null>;
  culprits: Partial<Record<MetricName, Culprit>>;
  lcpByDevice: Partial<Record<Device, number>>;
};

export async function getDiagnostics(f: Filter, pages: PageRow[]): Promise<PageDiagnostics[]> {
  if (pages.length === 0) return [];
  const { start, now } = windowOf(f);
  const paths = pages.map((p) => p.path);
  const [culprits, devices] = await Promise.all([
    sql<{ path: string; metric: MetricName; target: string | null; resource: string | null; event_type: string | null; n: number; total: number }>(
      `SELECT path, metric, target, resource, event_type, n, total FROM (
         SELECT path, metric, target, resource, event_type, count(*)::int AS n,
           (sum(count(*)) OVER (PARTITION BY path, metric))::int AS total,
           row_number() OVER (PARTITION BY path, metric ORDER BY count(*) DESC) AS rank
         FROM events
         WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND ${deviceClause('$4')}
           AND path = ANY($5::text[]) AND metric IN (${CORE_METRICS.map((m) => `'${m}'`).join(',')})
           AND ${NOT_GOOD}
         GROUP BY path, metric, target, resource, event_type
       ) ranked WHERE rank = 1`,
      [f.siteId, start, now, deviceParam(f), paths],
    ),
    sql<{ path: string; device: Device; p75: number }>(
      `SELECT path, device, ${P75} AS p75 FROM events
       WHERE site_id = $1 AND created_at >= $2 AND created_at < $3
         AND path = ANY($4::text[]) AND metric = 'LCP'
       GROUP BY path, device HAVING count(*) >= 3`,
      [f.siteId, start, now, paths],
    ),
  ]);

  return pages.map((page) => {
    const d: PageDiagnostics = {
      path: page.path,
      views: page.views,
      p75: { LCP: page.LCP, INP: page.INP, CLS: page.CLS, TTFB: page.TTFB },
      culprits: {},
      lcpByDevice: {},
    };
    for (const c of culprits) {
      if (c.path !== page.path) continue;
      d.culprits[c.metric] = { target: c.target, resource: c.resource, eventType: c.event_type, share: c.n / c.total };
    }
    for (const r of devices) if (r.path === page.path) d.lcpByDevice[r.device] = r.p75;
    return d;
  });
}

export type AlertRow = {
  id: number; metric: MetricName; baseline: number; current: number; change: number; release: string | null; created_at: Date;
};

export async function getAlerts(siteId: string, limit = 10): Promise<AlertRow[]> {
  return sql<AlertRow>(
    `SELECT id::int, metric, baseline, current, change, release, created_at FROM alerts
     WHERE site_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [siteId, limit],
  );
}

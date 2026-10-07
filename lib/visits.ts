import { sql } from './db';
import { METRIC_INFO, type MetricName } from './metrics';
import { RANGES, type DeviceFilter, type RangeKey } from './queries';

export type VisitFilter = {
  siteId: string;
  range: RangeKey;
  device: DeviceFilter;
  slowOnly: boolean;
  user: string | null;
  before: Date | null;
  now?: Date;
};

export type Visit = {
  viewId: string;
  at: Date;
  path: string;
  device: string;
  country: string | null;
  connection: string | null;
  release: string | null;
  userId: string | null;
} & Record<MetricName, number | null>;

type VisitRow = {
  view_id: string; at: Date; path: string; device: string; country: string | null; connection: string | null;
  release: string | null; user_id: string | null; lcp: number | null; inp: number | null; cls: number | null; ttfb: number | null;
};

const metricMax = (m: MetricName) => `max(value) FILTER (WHERE metric = '${m}')`;
const SLOW = (['LCP', 'INP', 'CLS'] as const).map((m) => `${metricMax(m)} > ${METRIC_INFO[m].good}`).join(' OR ');

const VISIT_COLUMNS = `
  view_id, min(created_at) AS at, max(path) AS path, max(device) AS device, max(country) AS country,
  max(connection) AS connection, max(release) AS release, max(user_id) AS user_id,
  ${metricMax('LCP')} AS lcp, ${metricMax('INP')} AS inp, ${metricMax('CLS')} AS cls, ${metricMax('TTFB')} AS ttfb`;

const toVisit = (r: VisitRow): Visit => ({
  viewId: r.view_id,
  at: new Date(r.at),
  path: r.path,
  device: r.device,
  country: r.country,
  connection: r.connection,
  release: r.release,
  userId: r.user_id,
  LCP: r.lcp,
  INP: r.inp,
  CLS: r.cls,
  TTFB: r.ttfb,
});

export async function getVisits(f: VisitFilter, limit = 50): Promise<{ visits: Visit[]; nextBefore: string | null }> {
  const now = f.now ?? new Date();
  const start = new Date(now.getTime() - RANGES[f.range] * 86_400_000);
  const rows = await sql<VisitRow>(
    `SELECT ${VISIT_COLUMNS}
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3
       AND ($4::text IS NULL OR device = $4)
       AND ($5::text IS NULL OR user_id = $5)
     GROUP BY view_id
     HAVING ($6::timestamptz IS NULL OR min(created_at) < $6)
       AND (NOT $7::boolean OR ${SLOW})
     ORDER BY at DESC, view_id
     LIMIT $8`,
    [f.siteId, start, now, f.device === 'all' ? null : f.device, f.user, f.before, f.slowOnly, limit + 1],
  );
  const visits = rows.slice(0, limit).map(toVisit);
  const nextBefore = rows.length > limit ? visits[visits.length - 1].at.toISOString() : null;
  return { visits, nextBefore };
}

export type VisitDetail = Visit & {
  metrics: Array<{
    metric: MetricName; value: number; target: string | null; resource: string | null; eventType: string | null; at: Date;
  }>;
};

export async function getVisit(siteId: string, viewId: string): Promise<VisitDetail | null> {
  const [summary] = await sql<VisitRow>(
    `SELECT ${VISIT_COLUMNS} FROM events WHERE site_id = $1 AND view_id = $2 GROUP BY view_id`,
    [siteId, viewId],
  );
  if (!summary) return null;
  const metrics = await sql<{
    metric: MetricName; value: number; target: string | null; resource: string | null; event_type: string | null; created_at: Date;
  }>(
    `SELECT metric, value, target, resource, event_type, created_at FROM events
     WHERE site_id = $1 AND view_id = $2
     ORDER BY array_position(ARRAY['TTFB','LCP','INP','CLS'], metric)`,
    [siteId, viewId],
  );
  return {
    ...toVisit(summary),
    metrics: metrics.map((m) => ({
      metric: m.metric, value: m.value, target: m.target, resource: m.resource, eventType: m.event_type, at: new Date(m.created_at),
    })),
  };
}

export type UserExperience = {
  userId: string; visits: number; lastSeen: Date; LCP: number | null; INP: number | null; CLS: number | null;
};

export async function getSlowestUsers(f: Pick<VisitFilter, 'siteId' | 'range' | 'device' | 'now'>, limit = 10) {
  const now = f.now ?? new Date();
  const start = new Date(now.getTime() - RANGES[f.range] * 86_400_000);
  const p75 = (m: MetricName) => `percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric = '${m}')`;
  const rows = await sql<{
    user_id: string; visits: number; last_seen: Date; lcp: number | null; inp: number | null; cls: number | null;
  }>(
    `SELECT user_id, count(DISTINCT view_id)::int AS visits, max(created_at) AS last_seen,
       ${p75('LCP')} AS lcp, ${p75('INP')} AS inp, ${p75('CLS')} AS cls
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $3 AND user_id IS NOT NULL
       AND ($4::text IS NULL OR device = $4)
     GROUP BY user_id
     ORDER BY lcp DESC NULLS LAST
     LIMIT $5`,
    [f.siteId, start, now, f.device === 'all' ? null : f.device, limit],
  );
  return rows.map(
    (r): UserExperience => ({
      userId: r.user_id, visits: r.visits, lastSeen: new Date(r.last_seen), LCP: r.lcp, INP: r.inp, CLS: r.cls,
    }),
  );
}

import { sql } from './db';
import { CORE_METRICS, METRIC_INFO, formatValue, rate, type MetricName } from './metrics';

export type WindowStats = {
  metric: MetricName;
  baseline: number | null; // p75 over the previous 24h
  current: number | null; // p75 over the last 24h
  baselineN: number;
  currentN: number;
  baselineRelease: string | null; // most common release in each window
  currentRelease: string | null;
};

export type Regression = {
  metric: MetricName;
  baseline: number;
  current: number;
  change: number;
  release: string | null; // set when the regression lines up with a new release
};

export const MIN_SAMPLES = 30;

// Pure decision function: which metrics got meaningfully worse?
// A regression needs (1) enough samples on both sides that p75 is stable,
// (2) a relative change past the site's threshold, and (3) an absolute change
// big enough to matter, so tiny numbers don't produce scary percentages.
export function detectRegressions(stats: WindowStats[], threshold: number, minSamples = MIN_SAMPLES): Regression[] {
  const out: Regression[] = [];
  for (const s of stats) {
    if (s.baseline == null || s.current == null) continue;
    if (s.baselineN < minSamples || s.currentN < minSamples) continue;
    if (s.baseline <= 0) continue;
    const change = (s.current - s.baseline) / s.baseline;
    if (change < threshold) continue;
    if (s.current - s.baseline < METRIC_INFO[s.metric].minDelta) continue;
    const newRelease = s.currentRelease && s.currentRelease !== s.baselineRelease ? s.currentRelease : null;
    out.push({ metric: s.metric, baseline: s.baseline, current: s.current, change, release: newRelease });
  }
  return out;
}

export function describeRegression(r: Regression, siteName: string): string {
  const pct = Math.round(r.change * 100);
  const since = r.release ? `since release ${r.release}` : 'since yesterday';
  return (
    `${r.metric} got ${pct}% worse ${since} on ${siteName}: ` +
    `p75 ${formatValue(r.metric, r.baseline)} → ${formatValue(r.metric, r.current)} (${rate(r.metric, r.current).replace('-', ' ')})`
  );
}

export async function getWindowStats(siteId: string, now: Date): Promise<WindowStats[]> {
  const day = 86_400_000;
  const mid = new Date(now.getTime() - day);
  const start = new Date(now.getTime() - 2 * day);
  const rows = await sql<{
    metric: MetricName; baseline: number | null; current: number | null; baseline_n: number; current_n: number;
    baseline_release: string | null; current_release: string | null;
  }>(
    `SELECT metric,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE created_at <  $3) AS baseline,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE created_at >= $3) AS current,
       count(*) FILTER (WHERE created_at <  $3)::int AS baseline_n,
       count(*) FILTER (WHERE created_at >= $3)::int AS current_n,
       mode() WITHIN GROUP (ORDER BY release) FILTER (WHERE created_at <  $3) AS baseline_release,
       mode() WITHIN GROUP (ORDER BY release) FILTER (WHERE created_at >= $3) AS current_release
     FROM events
     WHERE site_id = $1 AND created_at >= $2 AND created_at < $4
       AND metric IN (${CORE_METRICS.map((m) => `'${m}'`).join(',')})
     GROUP BY metric`,
    [siteId, start, mid, now],
  );
  return rows.map((r) => ({
    metric: r.metric,
    baseline: r.baseline,
    current: r.current,
    baselineN: r.baseline_n,
    currentN: r.current_n,
    baselineRelease: r.baseline_release,
    currentRelease: r.current_release,
  }));
}

type SiteForAlerts = {
  id: string; name: string; domain: string; alert_threshold: number; webhook_url: string | null;
  alert_email: boolean; email: string;
};

// Checks every site (or one), records new regressions, and notifies.
// Alerts are unique per (site, metric, day): running this hourly is safe and
// only the first detection of the day sends a notification.
export async function runAlertCheck(opts: { siteId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const sites = await sql<SiteForAlerts>(
    `SELECT s.id, s.name, s.domain, s.alert_threshold, s.webhook_url, s.alert_email, u.email
     FROM sites s JOIN users u ON u.id = s.user_id
     WHERE ($1::uuid IS NULL OR s.id = $1)`,
    [opts.siteId ?? null],
  );

  const created: Array<{ siteId: string; message: string }> = [];
  for (const site of sites) {
    const regressions = detectRegressions(await getWindowStats(site.id, now), site.alert_threshold);
    for (const r of regressions) {
      const inserted = await sql(
        `INSERT INTO alerts (site_id, metric, baseline, current, change, release, day)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date)
         ON CONFLICT (site_id, metric, day) DO NOTHING RETURNING id`,
        [site.id, r.metric, r.baseline, r.current, r.change, r.release, now.toISOString().slice(0, 10)],
      );
      if (inserted.length === 0) continue;
      const message = describeRegression(r, site.domain);
      created.push({ siteId: site.id, message });
      await notify(site, message);
    }
  }
  return { checked: sites.length, created };
}

async function notify(site: SiteForAlerts, message: string) {
  const dashboard = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard/${site.id}`;
  const tasks: Promise<unknown>[] = [];

  // Slack, Discord (with /slack suffix) and most chat tools accept {text}.
  if (site.webhook_url) {
    tasks.push(
      fetch(site.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ ${message}\n${dashboard}` }),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }
  if (site.alert_email && process.env.RESEND_API_KEY) {
    tasks.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Resend's shared test sender works without owning a domain, but only
          // delivers to the address that owns the Resend account.
          from: process.env.ALERT_FROM_EMAIL ?? 'VitalSigns <onboarding@resend.dev>',
          to: site.email,
          subject: `[VitalSigns] ${message.split(':')[0]}`,
          text: `${message}\n\nOpen the dashboard: ${dashboard}`,
        }),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.error('[alerts] notification failed', r.reason);
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAlertCheck } from '../lib/alerts';
import { closeDb, sql } from '../lib/db';
import { insertEvents } from '../lib/events';
import { getBreakdown, getDiagnostics, getPages, getSummary, getTrends } from '../lib/queries';
import type { SiteRow } from '../lib/writer';

const NOW = new Date('2026-06-15T12:00:00Z');
const HOUR = 3_600_000;
let siteId: string;

function event(o: Partial<SiteRow> & { metricId: string }): SiteRow {
  return {
    siteId, viewId: o.metricId, metric: 'LCP', value: 1000, path: '/', device: 'desktop', country: 'US',
    connection: '4g', release: 'v1', target: null, resource: null, eventType: null, ...o,
  };
}

async function backdate(metricIds: string[], hoursAgo: number) {
  await sql('UPDATE events SET created_at = $1 WHERE metric_id = ANY($2::text[])', [
    new Date(NOW.getTime() - hoursAgo * HOUR), metricIds,
  ]);
}

beforeAll(async () => {
  const [user] = await sql<{ id: string }>(`INSERT INTO users (email, password_hash) VALUES ('t@t.dev', 'x') RETURNING id`);
  const [site] = await sql<{ id: string }>(
    `INSERT INTO sites (user_id, name, domain, public_key) VALUES ($1, 'Test', 'test.dev', 'vs_test') RETURNING id`,
    [user.id],
  );
  siteId = site.id;
});

afterAll(closeDb);

describe('insertEvents', () => {
  it('upserts re-sent metrics instead of double counting', async () => {
    await insertEvents([event({ metricId: 'dup', metric: 'CLS', value: 0.05 })]);
    await insertEvents([event({ metricId: 'dup', metric: 'CLS', value: 0.3, target: 'div.ad' })]);
    const rows = await sql<{ value: number; target: string }>(`SELECT value, target FROM events WHERE metric_id = 'dup'`);
    expect(rows).toEqual([{ value: 0.3, target: 'div.ad' }]);
    await sql(`DELETE FROM events WHERE metric_id = 'dup'`);
  });
});

describe('dashboard queries and alerts', () => {
  beforeAll(async () => {
    const yesterday = Array.from({ length: 40 }, (_, i) =>
      event({ metricId: `y${i}`, viewId: `yv${i}`, value: 1800 + i * 10, release: 'v1' }),
    );
    const today = Array.from({ length: 40 }, (_, i) =>
      event({
        metricId: `t${i}`, viewId: `tv${i}`, value: 3600 + i * 10, release: 'v2', device: i % 2 ? 'mobile' : 'desktop',
        country: i % 4 ? 'US' : 'DE', target: 'img.hero', resource: 'https://test.dev/hero.png',
      }),
    );
    const inp = Array.from({ length: 10 }, (_, i) =>
      event({
        metricId: `i${i}`, viewId: `tv${i}`, metric: 'INP', value: 450, target: 'button#buy', eventType: 'click',
        device: i % 2 ? 'mobile' : 'desktop', country: i % 4 ? 'US' : 'DE',
      }),
    );
    await insertEvents([...yesterday, ...today, ...inp]);
    await backdate(yesterday.map((e) => e.metricId), 30);
    await backdate([...today, ...inp].map((e) => e.metricId), 2);
  });

  const filter = () => ({ siteId, range: '24h' as const, device: 'all' as const, now: NOW });

  it('summarises p75, the previous period and the rating split', async () => {
    const { metrics, views } = await getSummary(filter());
    expect(views).toBe(40);
    expect(metrics.LCP.n).toBe(40);
    expect(metrics.LCP.p75).toBeCloseTo(3600 + 29.25 * 10);
    expect(metrics.LCP.prevP75).toBeCloseTo(1800 + 29.25 * 10);
    expect(metrics.LCP.good + metrics.LCP.needsImprovement + metrics.LCP.poor).toBe(40);
    expect(metrics.INP.poor).toBe(0);
    expect(metrics.INP.needsImprovement).toBe(10);
  });

  it('respects the device filter', async () => {
    const { metrics } = await getSummary({ ...filter(), device: 'mobile' });
    expect(metrics.LCP.n).toBe(20);
  });

  it('buckets trends hourly for 24h and leaves empty hours empty', async () => {
    const trends = await getTrends(filter());
    expect(trends.LCP).toHaveLength(24);
    expect(trends.LCP.filter((p) => p.n > 0)).toHaveLength(1);
    expect(trends.LCP.filter((p) => p.p75 == null)).toHaveLength(23);
  });

  it('ranks pages, breaks down by device and country, and finds culprits', async () => {
    const pages = await getPages(filter());
    expect(pages[0]).toMatchObject({ path: '/', views: 40 });
    expect(pages[0].INP).toBe(450);

    const countries = await getBreakdown(filter(), 'country');
    expect(countries.map((c) => [c.key, c.views])).toEqual([['US', 30], ['DE', 10]]);

    const [diag] = await getDiagnostics(filter(), pages);
    expect(diag.culprits.LCP).toMatchObject({ target: 'img.hero', resource: 'https://test.dev/hero.png', share: 1 });
    expect(diag.culprits.INP).toMatchObject({ target: 'button#buy', eventType: 'click' });
    expect(Object.keys(diag.lcpByDevice).sort()).toEqual(['desktop', 'mobile']);
  });

  it('records one alert per metric per day and names the release', async () => {
    const first = await runAlertCheck({ siteId, now: NOW });
    expect(first.created.map((a) => a.message)).toEqual([
      expect.stringMatching(/^LCP got \d+% worse since release v2 on test\.dev/),
    ]);
    const again = await runAlertCheck({ siteId, now: NOW });
    expect(again.created).toEqual([]);
    const [{ count }] = await sql<{ count: number }>('SELECT count(*)::int AS count FROM alerts WHERE site_id = $1', [siteId]);
    expect(count).toBe(1);
  });
});

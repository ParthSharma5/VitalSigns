import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminOverview } from '../lib/admin';
import { getSlowestUsers, getVisit, getVisits } from '../lib/visits';
import { runAlertCheck } from '../lib/alerts';
import { closeDb, sql } from '../lib/db';
import { insertEvents, noteRejectedOrigin } from '../lib/events';
import { getBreakdown, getDiagnostics, getPages, getSummary, getTrends } from '../lib/queries';
import { getInstallStatus } from '../lib/sites';
import type { SiteRow } from '../lib/writer';

const NOW = new Date('2026-06-15T12:00:00Z');
const HOUR = 3_600_000;
let siteId: string;

function event(o: Partial<SiteRow> & { metricId: string }): SiteRow {
  return {
    siteId, viewId: o.metricId, metric: 'LCP', value: 1000, path: '/', device: 'desktop', country: 'US',
    connection: '4g', release: 'v1', target: null, resource: null, eventType: null, userId: null, ...o,
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

describe('admin overview', () => {
  it('summarises users, sites and data across all accounts', async () => {
    const { totals, users, sites } = await getAdminOverview();
    expect(totals.users).toBe(1);
    expect(totals.sites).toBe(1);
    expect(totals.events).toBe(90);
    expect(users[0]).toMatchObject({ email: 't@t.dev', sites: 1 });
    expect(sites[0]).toMatchObject({ domain: 'test.dev', owner: 't@t.dev', events: 90, alerts: 1 });
    expect(sites[0].last_event).not.toBeNull();
  });
});

describe('visits', () => {
  const vf = () => ({ siteId, range: '24h' as const, device: 'all' as const, slowOnly: false, user: null, before: null, now: NOW });

  beforeAll(async () => {
    await insertEvents([
      event({ metricId: 'vx-lcp', viewId: 'vx', value: 1200, path: '/fast', userId: 'u_1' }),
      event({ metricId: 'vx-cls', viewId: 'vx', metric: 'CLS', value: 0.02, path: '/fast', userId: 'u_1' }),
      event({ metricId: 'vy-lcp', viewId: 'vy', value: 5200, path: '/slow', userId: 'u_2', target: 'img.hero', resource: 'https://test.dev/h.png' }),
      event({ metricId: 'vy-inp', viewId: 'vy', metric: 'INP', value: 600, path: '/slow', userId: 'u_2', target: 'button#go', eventType: 'click' }),
    ]);
    await backdate(['vx-lcp', 'vx-cls'], 1);
    await backdate(['vy-lcp', 'vy-inp'], 0.5);
  });

  it('lists one row per page view, newest first, with every metric', async () => {
    const { visits } = await getVisits(vf());
    expect(visits[0]).toMatchObject({ viewId: 'vy', path: '/slow', userId: 'u_2', LCP: 5200, INP: 600, CLS: null });
    expect(visits[1]).toMatchObject({ viewId: 'vx', LCP: 1200, CLS: 0.02 });
  });

  it('filters to slow visits and to one user', async () => {
    const slow = await getVisits({ ...vf(), slowOnly: true });
    expect(slow.visits.map((v) => v.viewId)).not.toContain('vx');
    const one = await getVisits({ ...vf(), user: 'u_1' });
    expect(one.visits.map((v) => v.viewId)).toEqual(['vx']);
  });

  it('pages backwards with a cursor', async () => {
    const page1 = await getVisits(vf(), 1);
    expect(page1.visits.map((v) => v.viewId)).toEqual(['vy']);
    const page2 = await getVisits({ ...vf(), before: new Date(page1.nextBefore!) }, 1);
    expect(page2.visits.map((v) => v.viewId)).toEqual(['vx']);
  });

  it('returns a single visit with attribution, scoped to the site', async () => {
    const v = await getVisit(siteId, 'vy');
    expect(v?.metrics.map((m) => m.metric)).toEqual(['LCP', 'INP']);
    expect(v?.metrics[1]).toMatchObject({ target: 'button#go', eventType: 'click' });
    expect(await getVisit('00000000-0000-4000-8000-000000000000', 'vy')).toBeNull();
  });

  it('ranks users by their slowest experience', async () => {
    const users = await getSlowestUsers({ siteId, range: '24h', device: 'all', now: NOW });
    expect(users.map((u) => u.userId)).toEqual(['u_2', 'u_1']);
  });
});

describe('fresh installs', () => {
  let freshId: string;
  beforeAll(async () => {
    const [user] = await sql<{ id: string }>(`SELECT user_id AS id FROM sites WHERE id = $1`, [siteId]);
    const [site] = await sql<{ id: string }>(
      `INSERT INTO sites (user_id, name, domain, public_key) VALUES ($1, 'Fresh', 'fresh.dev', 'vs_fresh') RETURNING id`,
      [user.id],
    );
    freshId = site.id;
  });

  it('reports waiting, then a rejected origin, then receiving data', async () => {
    expect(await getInstallStatus(freshId)).toEqual({ lastEventAt: null, lastPath: null, rejectedOrigin: null, rejectedAt: null });

    await noteRejectedOrigin(freshId, 'https://fresh.vercel.app');
    const rejected = await getInstallStatus(freshId);
    expect(rejected.rejectedOrigin).toBe('https://fresh.vercel.app');
    expect(rejected.rejectedAt).toBeInstanceOf(Date);

    await insertEvents([event({ siteId: freshId, metricId: 'f1', viewId: 'fv1', path: '/pricing' })]);
    const live = await getInstallStatus(freshId);
    expect(live.lastPath).toBe('/pricing');
    expect(live.lastEventAt!.getTime()).toBeGreaterThanOrEqual(rejected.rejectedAt!.getTime());
  });

  it('lists pages from the very first view', async () => {
    const pages = await getPages({ siteId: freshId, range: '24h', device: 'all' });
    expect(pages).toEqual([expect.objectContaining({ path: '/pricing', views: 1, LCP: 1000 })]);
  });
});

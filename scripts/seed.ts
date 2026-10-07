import { runAlertCheck } from '../lib/alerts';
import { closeDb, sql } from '../lib/db';
import { normalizePath } from '../lib/ingest';
import { hashPassword } from '../lib/password';

const DAYS = 30;
const VIEWS_PER_DAY = 420;
const RELEASE_AT_HOURS_AGO = 20;

let state = 42;
const rand = () => {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const lognormal = (median: number, sigma: number) => median * Math.exp(sigma * gauss());
const pick = <T,>(items: Array<[T, number]>): T => {
  let r = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of items) if ((r -= w) <= 0) return item;
  return items[0][0];
};

type PageProfile = {
  path: () => string;
  weight: number;
  ttfb: number;
  lcp: number;
  inp: number;
  cls: number;
  lcpTarget: string;
  lcpResource?: string;
  inpTarget: string;
  inpEvent: string;
  clsTarget: string;
};

const PAGES: PageProfile[] = [
  { path: () => '/', weight: 30, ttfb: 320, lcp: 1300, inp: 90, cls: 0.03, lcpTarget: 'img.hero', lcpResource: 'https://acme.example/images/hero.webp', inpTarget: 'button.menu-toggle', inpEvent: 'click', clsTarget: 'header' },
  { path: () => `/products/${1000 + Math.floor(rand() * 400)}`, weight: 25, ttfb: 450, lcp: 2300, inp: 140, cls: 0.05, lcpTarget: 'img.product-photo', lcpResource: 'https://acme.example/images/products/large-photo.png', inpTarget: 'button.add-to-cart', inpEvent: 'click', clsTarget: 'div.reviews' },
  { path: () => '/checkout', weight: 8, ttfb: 380, lcp: 1200, inp: 330, cls: 0.02, lcpTarget: 'h1', inpTarget: 'button#pay', inpEvent: 'click', clsTarget: 'form.payment' },
  { path: () => '/blog/web-vitals-guide', weight: 12, ttfb: 260, lcp: 1300, inp: 70, cls: 0.17, lcpTarget: 'h1.post-title', inpTarget: 'a.share', inpEvent: 'click', clsTarget: 'div.ad-banner' },
  { path: () => '/search', weight: 10, ttfb: 1200, lcp: 2100, inp: 160, cls: 0.04, lcpTarget: 'h2.results-heading', inpTarget: 'input#q', inpEvent: 'keydown', clsTarget: 'ul.results' },
  { path: () => '/pricing', weight: 10, ttfb: 240, lcp: 900, inp: 60, cls: 0.01, lcpTarget: 'h1', inpTarget: 'button.plan-toggle', inpEvent: 'click', clsTarget: 'section.plans' },
  { path: () => '/about', weight: 5, ttfb: 230, lcp: 1000, inp: 50, cls: 0.02, lcpTarget: 'img.team', lcpResource: 'https://acme.example/images/team.avif', inpTarget: 'a', inpEvent: 'click', clsTarget: 'footer' },
];

const DEVICES: Array<[{ device: string; cpu: number; net: number }, number]> = [
  [{ device: 'mobile', cpu: 2.0, net: 1.35 }, 55],
  [{ device: 'desktop', cpu: 1.0, net: 1.0 }, 40],
  [{ device: 'tablet', cpu: 1.5, net: 1.2 }, 5],
];
const COUNTRIES: Array<[{ code: string | null; latency: number }, number]> = [
  [{ code: 'US', latency: 1.0 }, 35], [{ code: 'IN', latency: 1.6 }, 15], [{ code: 'GB', latency: 1.0 }, 10],
  [{ code: 'DE', latency: 1.0 }, 8], [{ code: 'BR', latency: 1.4 }, 7], [{ code: 'FR', latency: 1.0 }, 5],
  [{ code: 'CA', latency: 1.0 }, 5], [{ code: 'JP', latency: 1.2 }, 5], [{ code: 'AU', latency: 1.3 }, 4],
  [{ code: 'NG', latency: 1.8 }, 3], [{ code: null, latency: 1.1 }, 3],
];
const CONNECTIONS: Array<[string, number]> = [['4g', 85], ['3g', 10], ['wifi', 5]];

async function main() {
  console.log('Resetting demo account…');
  await sql(`DELETE FROM users WHERE email = 'demo@vitalsigns.dev'`);
  const [user] = await sql<{ id: string }>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    ['demo@vitalsigns.dev', await hashPassword('demo-password')],
  );
  const [site] = await sql<{ id: string }>(
    `INSERT INTO sites (user_id, name, domain, public_key) VALUES ($1, 'Acme Store', 'acme.example', 'vs_demo') RETURNING id`,
    [user.id],
  );

  const now = Date.now();
  const releaseAt = now - RELEASE_AT_HOURS_AGO * 3_600_000;
  const cols: Record<string, unknown[]> = {
    metric_id: [], view_id: [], metric: [], value: [], path: [], device: [], country: [], connection: [],
    release: [], target: [], resource: [], event_type: [], created_at: [], user_id: [],
  };
  const push = (row: Record<string, unknown>) => {
    for (const k of Object.keys(cols)) cols[k].push(row[k] ?? null);
  };

  let views = 0;
  for (let day = DAYS; day > 0; day--) {
    const dayStart = now - day * 86_400_000;
    const weekday = new Date(dayStart).getUTCDay();
    const count = Math.round(VIEWS_PER_DAY * (0.75 + 0.25 * (1 - day / DAYS)) * (weekday === 0 || weekday === 6 ? 0.7 : 1));

    for (let v = 0; v < count; v++) {
      let offset: number;
      do offset = rand() * 86_400_000;
      while (rand() > 0.45 + 0.55 * Math.sin((offset / 86_400_000) * Math.PI));
      const at = dayStart + offset;
      if (at > now) continue;

      const page = pick(PAGES.map((p) => [p, p.weight] as [PageProfile, number]));
      const dev = pick(DEVICES);
      const geo = pick(COUNTRIES);
      const released = at >= releaseAt;
      const viewId = `seed${views.toString(36)}`;
      const path = normalizePath(page.path());

      const regression = released ? 1.45 : 1;
      const ttfb = lognormal(page.ttfb * geo.latency, 0.45);
      const lcp = Math.max(ttfb + 150, lognormal(page.lcp * dev.net * geo.latency * regression, 0.35));
      const base = {
        view_id: viewId, path, device: dev.device, country: geo.code, connection: pick(CONNECTIONS),
        release: released ? 'v1.5.0' : 'v1.4.2', created_at: new Date(at),
        user_id: rand() < 0.35 ? `u_${1001 + Math.floor(rand() * 60)}` : null,
      };

      push({ ...base, metric_id: `${viewId}-ttfb`, metric: 'TTFB', value: Math.round(ttfb) });
      push({
        ...base, metric_id: `${viewId}-lcp`, metric: 'LCP', value: Math.round(lcp), target: page.lcpTarget,
        resource: released && path === '/' ? 'https://acme.example/images/hero-full.jpg' : page.lcpResource,
      });
      if (rand() < 0.65) {
        push({
          ...base, metric_id: `${viewId}-inp`, metric: 'INP', value: Math.round(lognormal(page.inp * dev.cpu, 0.55)),
          target: page.inpTarget, event_type: page.inpEvent,
        });
      }
      const cls = rand() < 0.4 ? 0 : lognormal(page.cls * (dev.device === 'mobile' ? 1.4 : 1), 0.7);
      push({
        ...base, metric_id: `${viewId}-cls`, metric: 'CLS', value: Math.round(cls * 1e4) / 1e4,
        target: cls > 0 ? page.clsTarget : null,
      });
      views++;
    }
  }

  const total = cols.metric.length;
  console.log(`Inserting ${total.toLocaleString()} events from ${views.toLocaleString()} page views…`);
  const CHUNK = 5000;
  for (let i = 0; i < total; i += CHUNK) {
    const slice = (k: string) => cols[k].slice(i, i + CHUNK);
    await sql(
      `INSERT INTO events (site_id, metric_id, view_id, metric, value, path, device, country, connection, release,
         target, resource, event_type, created_at, user_id)
       SELECT $1::uuid, * FROM unnest($2::text[], $3::text[], $4::text[], $5::float8[], $6::text[], $7::text[], $8::text[],
         $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::timestamptz[], $15::text[])`,
      [site.id, ...Object.keys(cols).map(slice)],
    );
  }

  const { created } = await runAlertCheck({ siteId: site.id });
  for (const a of created) console.log(`Alert: ${a.message}`);

  console.log('\nDone. Log in as demo@vitalsigns.dev / demo-password');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

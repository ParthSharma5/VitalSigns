import { z } from 'zod';
import { METRIC_INFO, isMetric, type MetricName } from './metrics';

const beaconSchema = z.object({
  s: z.string().min(1).max(64),
  p: z.string().max(2048),
  v: z.string().min(1).max(32),
  r: z.string().max(64).optional(),
  c: z.string().max(16).optional(),
  a: z.string().max(64).optional(),
  m: z
    .array(
      z.object({
        n: z.string(),
        i: z.string().min(1).max(64),
        x: z.number(),
        t: z.string().max(80).optional(),
        u: z.string().max(200).optional(),
        e: z.string().max(32).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export type Beacon = z.infer<typeof beaconSchema>;

export type EventRow = {
  metricId: string;
  viewId: string;
  metric: MetricName;
  value: number;
  path: string;
  device: Device;
  country: string | null;
  connection: string | null;
  release: string | null;
  target: string | null;
  resource: string | null;
  eventType: string | null;
  userId: string | null;
};

export const MAX_BODY_BYTES = 8 * 1024;

export function parseBeacon(body: string): Beacon | null {
  if (body.length > MAX_BODY_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = beaconSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type Device = 'mobile' | 'tablet' | 'desktop';

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|preview/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

export function classifyDevice(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function normalizePath(raw: string): string {
  let path = raw.split(/[?#]/)[0] || '/';
  if (!path.startsWith('/')) path = '/' + path;
  path = path
    .split('/')
    .map((seg) => (/^\d{3,}$/.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) || /^[0-9a-f-]{36}$/i.test(seg) ? ':id' : seg))
    .join('/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path.slice(0, 300);
}

export function countryFromHeaders(headers: Headers): string | null {
  const raw =
    headers.get('x-vercel-ip-country') ??
    headers.get('cf-ipcountry') ??
    headers.get('cloudfront-viewer-country') ??
    headers.get('x-country') ??
    headers.get('x-country-code');
  if (!raw || !/^[A-Za-z]{2}$/.test(raw) || raw.toUpperCase() === 'XX') return null;
  return raw.toUpperCase();
}

export function cleanUserId(raw: string | undefined): string | null {
  const id = raw?.trim();
  if (!id || id.includes('@') || /^\+?\d[\d\s-]{7,}$/.test(id)) return null;
  return id;
}

export function toRows(beacon: Beacon, ctx: { device: Device; country: string | null }): EventRow[] {
  const path = normalizePath(beacon.p);
  const userId = cleanUserId(beacon.a);
  const rows: EventRow[] = [];
  for (const m of beacon.m) {
    if (!isMetric(m.n)) continue;
    if (m.x < 0 || m.x > METRIC_INFO[m.n].maxValid) continue;
    rows.push({
      metricId: m.i,
      viewId: beacon.v,
      metric: m.n,
      value: m.x,
      path,
      device: ctx.device,
      country: ctx.country,
      connection: beacon.c ?? null,
      release: beacon.r ?? null,
      target: m.t ?? null,
      resource: m.u ?? null,
      eventType: m.e ?? null,
      userId,
    });
  }
  return rows;
}

export function originAllowed(origin: string | null, domain: string): boolean {
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const d = domain.toLowerCase().replace(/^www\./, '');
  return host === d || host.endsWith('.' + d);
}

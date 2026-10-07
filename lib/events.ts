import { sql } from './db';
import { EventWriter, type SiteRow } from './writer';

export async function insertEvents(rows: SiteRow[]) {
  const col = <K extends keyof SiteRow>(k: K) => rows.map((r) => r[k]);
  await sql(
    `INSERT INTO events
       (site_id, metric_id, view_id, metric, value, path, device, country, connection, release, target, resource, event_type, user_id)
     SELECT * FROM unnest(
       $1::uuid[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[], $7::text[],
       $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])
     ON CONFLICT (site_id, metric_id) DO UPDATE SET
       value = EXCLUDED.value, target = EXCLUDED.target, resource = EXCLUDED.resource,
       event_type = EXCLUDED.event_type, user_id = EXCLUDED.user_id`,
    [
      col('siteId'), col('metricId'), col('viewId'), col('metric'), col('value'), col('path'), col('device'),
      col('country'), col('connection'), col('release'), col('target'), col('resource'), col('eventType'), col('userId'),
    ],
  );
}

const g = globalThis as unknown as { __vitalsignsWriter?: EventWriter };
export function getWriter(): EventWriter {
  g.__vitalsignsWriter ??= new EventWriter({ write: insertEvents });
  return g.__vitalsignsWriter;
}

// Remembers the origin of a beacon that failed the domain check, at most once a minute per
// site and origin, so the install page can tell the owner why no data is arriving.
export async function noteRejectedOrigin(siteId: string, origin: string) {
  await sql(
    `UPDATE sites SET rejected_origin = $2, rejected_at = now()
     WHERE id = $1 AND (rejected_at IS NULL OR rejected_at < now() - interval '1 minute' OR rejected_origin IS DISTINCT FROM $2)`,
    [siteId, origin.slice(0, 200)],
  );
}

type SiteInfo ={ id: string; domain: string } | null;
const siteCache = new Map<string, { site: SiteInfo; expires: number }>();
const SITE_TTL_MS = 60_000;

export async function lookupSite(publicKey: string): Promise<SiteInfo> {
  const hit = siteCache.get(publicKey);
  if (hit && hit.expires > Date.now()) return hit.site;
  const [row] = await sql<{ id: string; domain: string }>('SELECT id, domain FROM sites WHERE public_key = $1', [
    publicKey,
  ]);
  const site = row ?? null;
  if (siteCache.size > 10_000) siteCache.clear();
  siteCache.set(publicKey, { site, expires: Date.now() + SITE_TTL_MS });
  return site;
}

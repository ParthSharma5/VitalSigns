import { notFound } from 'next/navigation';
import { cache } from 'react';
import { sql } from './db';

export type Site = {
  id: string;
  name: string;
  domain: string;
  public_key: string;
  alert_threshold: number;
  webhook_url: string | null;
  alert_email: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getSiteForUser = cache(async (siteId: string, userId: string): Promise<Site> => {
  if (!UUID_RE.test(siteId)) notFound();
  const [site] = await sql<Site>(
    `SELECT id, name, domain, public_key, alert_threshold, webhook_url, alert_email
     FROM sites WHERE id = $1 AND user_id = $2`,
    [siteId, userId],
  );
  if (!site) notFound();
  return site;
});

export async function listSites(userId: string) {
  return sql<Site & { views_7d: number }>(
    `SELECT s.id, s.name, s.domain, s.public_key, s.alert_threshold, s.webhook_url, s.alert_email,
       (SELECT count(DISTINCT view_id)::int FROM events e
         WHERE e.site_id = s.id AND e.created_at > now() - interval '7 days') AS views_7d
     FROM sites s WHERE s.user_id = $1 ORDER BY s.created_at`,
    [userId],
  );
}

export type InstallStatus = {
  lastEventAt: Date | null;
  lastPath: string | null;
  rejectedOrigin: string | null;
  rejectedAt: Date | null;
};

// Whether the snippet is reporting yet, for the "waiting for data" / "connected" state.
export async function getInstallStatus(siteId: string): Promise<InstallStatus> {
  const [row] = await sql<{ last_event_at: Date | null; last_path: string | null; rejected_origin: string | null; rejected_at: Date | null }>(
    `SELECT e.created_at AS last_event_at, e.path AS last_path, s.rejected_origin, s.rejected_at
     FROM sites s
     LEFT JOIN LATERAL (
       SELECT created_at, path FROM events WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1
     ) e ON true
     WHERE s.id = $1`,
    [siteId],
  );
  return {
    lastEventAt: row?.last_event_at ?? null,
    lastPath: row?.last_path ?? null,
    rejectedOrigin: row?.rejected_origin ?? null,
    rejectedAt: row?.rejected_at ?? null,
  };
}

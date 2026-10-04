import { notFound } from 'next/navigation';
import { requireUser, type User } from './auth';
import { sql } from './db';

export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

export async function getAdminOverview() {
  const [totals] = await sql<{ users: number; sites: number; events: number; events_24h: number; active_sites_7d: number }>(
    `SELECT
       (SELECT count(*)::int FROM users) AS users,
       (SELECT count(*)::int FROM sites) AS sites,
       (SELECT count(*)::int FROM events) AS events,
       (SELECT count(*)::int FROM events WHERE created_at > now() - interval '24 hours') AS events_24h,
       (SELECT count(DISTINCT site_id)::int FROM events WHERE created_at > now() - interval '7 days') AS active_sites_7d`,
  );

  const users = await sql<{
    id: string; email: string; created_at: Date; sites: number; events_7d: number; last_seen: Date | null;
  }>(
    `SELECT u.id, u.email, u.created_at,
       (SELECT count(*)::int FROM sites s WHERE s.user_id = u.id) AS sites,
       (SELECT count(*)::int FROM events e JOIN sites s ON s.id = e.site_id
         WHERE s.user_id = u.id AND e.created_at > now() - interval '7 days') AS events_7d,
       (SELECT max(se.expires_at) - interval '30 days' FROM sessions se WHERE se.user_id = u.id) AS last_seen
     FROM users u ORDER BY u.created_at DESC`,
  );

  const sites = await sql<{
    id: string; name: string; domain: string; owner: string; created_at: Date;
    events: number; events_24h: number; views_7d: number; last_event: Date | null; alerts: number;
  }>(
    `SELECT s.id, s.name, s.domain, u.email AS owner, s.created_at,
       coalesce(e.events, 0) AS events,
       coalesce(e.events_24h, 0) AS events_24h,
       coalesce(e.views_7d, 0) AS views_7d,
       e.last_event,
       (SELECT count(*)::int FROM alerts a WHERE a.site_id = s.id) AS alerts
     FROM sites s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN (
       SELECT site_id,
         count(*)::int AS events,
         (count(*) FILTER (WHERE created_at > now() - interval '24 hours'))::int AS events_24h,
         (count(DISTINCT view_id) FILTER (WHERE created_at > now() - interval '7 days'))::int AS views_7d,
         max(created_at) AS last_event
       FROM events GROUP BY site_id
     ) e ON e.site_id = s.id
     ORDER BY e.last_event DESC NULLS LAST, s.created_at DESC`,
  );

  return { totals, users, sites };
}

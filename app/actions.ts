'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { runAlertCheck } from '@/lib/alerts';
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeDomain, webhookAllowed } from '@/lib/validation';

export type FormState = { error?: string; ok?: string } | undefined;

const credentials = z.object({
  email: z.email('Enter a valid email address.').max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});

// Only allow same-site relative redirects after login.
const safeNext = (next: FormDataEntryValue | null) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;

  const rows = await sql<{ id: string }>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
    [email, await hashPassword(password)],
  );
  if (rows.length === 0) return { error: 'An account with that email already exists. Try logging in.' };
  await createSession(rows[0].id);
  redirect('/dashboard');
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Incorrect email or password.' };
  const [user] = await sql<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [parsed.data.email],
  );
  // Same message either way so the form doesn't reveal which emails exist.
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return { error: 'Incorrect email or password.' };
  }
  await createSession(user.id);
  redirect(safeNext(form.get('next')));
}

export async function logout() {
  await destroySession();
  redirect('/');
}

export async function createSite(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  const domain = normalizeDomain(String(form.get('domain') ?? ''));
  if (!domain) return { error: 'Enter a domain like example.com.' };

  const [site] = await sql<{ id: string }>(
    'INSERT INTO sites (user_id, name, domain, public_key) VALUES ($1, $2, $3, $4) RETURNING id',
    [user.id, name || domain, domain, `vs_${randomBytes(9).toString('base64url')}`],
  );
  redirect(`/dashboard/${site.id}/settings?new=1`);
}

export async function updateSite(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  const domain = normalizeDomain(String(form.get('domain') ?? ''));
  const thresholdPct = Number(form.get('threshold'));
  const webhookRaw = String(form.get('webhook') ?? '').trim();
  const alertEmail = form.get('alertEmail') === 'on';

  if (!name) return { error: 'Name is required.' };
  if (!domain) return { error: 'Enter a domain like example.com.' };
  if (!Number.isFinite(thresholdPct) || thresholdPct < 5 || thresholdPct > 500) {
    return { error: 'Alert threshold must be between 5% and 500%.' };
  }
  let webhook: string | null = null;
  if (webhookRaw) {
    let url: URL;
    try {
      url = new URL(webhookRaw);
    } catch {
      return { error: 'Webhook must be a valid URL.' };
    }
    if (!webhookAllowed(url)) return { error: 'Webhook must be a public https:// URL.' };
    webhook = url.toString();
  }

  const updated = await sql(
    `UPDATE sites SET name = $3, domain = $4, alert_threshold = $5, webhook_url = $6, alert_email = $7
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [siteId, user.id, name, domain, thresholdPct / 100, webhook, alertEmail],
  );
  if (updated.length === 0) return { error: 'Site not found.' };
  revalidatePath(`/dashboard/${siteId}`, 'layout');
  return { ok: 'Saved.' };
}

export async function deleteSite(siteId: string) {
  const user = await requireUser();
  await sql('DELETE FROM sites WHERE id = $1 AND user_id = $2', [siteId, user.id]);
  redirect('/dashboard');
}

export async function checkAlertsNow(siteId: string): Promise<FormState> {
  const user = await requireUser();
  const [owned] = await sql('SELECT 1 FROM sites WHERE id = $1 AND user_id = $2', [siteId, user.id]);
  if (!owned) return { error: 'Site not found.' };
  const { created } = await runAlertCheck({ siteId });
  revalidatePath(`/dashboard/${siteId}`);
  return { ok: created.length ? `${created.length} new alert(s).` : 'No new regressions.' };
}

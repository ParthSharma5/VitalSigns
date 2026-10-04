import { headers } from 'next/headers';

// The public address of this app: APP_URL when set, otherwise whatever host the
// request came in on (localhost in dev, the *.vercel.app URL on Vercel), so
// no custom domain is needed.
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

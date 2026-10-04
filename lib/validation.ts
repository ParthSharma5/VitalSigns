import { isIP } from 'node:net';

export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host === 'localhost' ? host : null;
  } catch {
    return null;
  }
}

export function webhookAllowed(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (isIP(host)) {
    return !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80)/i.test(host);
  }
  return true;
}

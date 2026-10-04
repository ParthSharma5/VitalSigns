import { describe, expect, it } from 'vitest';
import {
  classifyDevice, countryFromHeaders, isBot, normalizePath, originAllowed, parseBeacon, toRows, MAX_BODY_BYTES,
} from '../lib/ingest';
import { normalizeDomain, webhookAllowed } from '../lib/validation';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  lighthouse: 'Mozilla/5.0 (Linux; Android 11) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse',
};

const beacon = (overrides: object = {}) =>
  JSON.stringify({
    s: 'vs_key', p: '/products/12345?utm_source=x', v: 'abc123', r: 'v1.2.0', c: '4g',
    m: [
      { n: 'LCP', i: 'v5-1', x: 2400, t: 'img.hero', u: 'https://x.com/hero.jpg' },
      { n: 'CLS', i: 'v5-2', x: 0.12, t: 'div.ad' },
    ],
    ...overrides,
  });

describe('parseBeacon', () => {
  it('accepts a valid beacon', () => {
    expect(parseBeacon(beacon())?.m).toHaveLength(2);
  });

  it('rejects malformed, oversized and invalid input', () => {
    expect(parseBeacon('not json')).toBeNull();
    expect(parseBeacon(beacon({ m: [] }))).toBeNull();
    expect(parseBeacon(beacon({ s: '' }))).toBeNull();
    expect(parseBeacon('x'.repeat(MAX_BODY_BYTES + 1))).toBeNull();
    expect(parseBeacon(beacon({ m: [{ n: 'LCP', i: 'a', x: 'fast' }] }))).toBeNull();
  });
});

describe('toRows', () => {
  it('normalises the path and keeps attribution', () => {
    const rows = toRows(parseBeacon(beacon())!, { device: 'mobile', country: 'DE' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      metric: 'LCP', value: 2400, path: '/products/:id', device: 'mobile', country: 'DE', release: 'v1.2.0',
      target: 'img.hero', resource: 'https://x.com/hero.jpg', viewId: 'abc123', metricId: 'v5-1',
    });
  });

  it('drops unknown metrics and implausible values instead of the whole beacon', () => {
    const b = parseBeacon(
      beacon({ m: [{ n: 'FID', i: 'a', x: 10 }, { n: 'LCP', i: 'b', x: -5 }, { n: 'LCP', i: 'c', x: 9e9 }, { n: 'INP', i: 'd', x: 80 }] }),
    )!;
    expect(toRows(b, { device: 'desktop', country: null }).map((r) => r.metricId)).toEqual(['d']);
  });
});

describe('normalizePath', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/blog/', '/blog'],
    ['/blog/post?x=1#top', '/blog/post'],
    ['/orders/88123/items', '/orders/:id/items'],
    ['/u/3f2a9c1e5b7d4a6f8e0c', '/u/:id'],
    ['/t/123e4567-e89b-12d3-a456-426614174000', '/t/:id'],
    ['/About', '/About'],
    ['/v2/api', '/v2/api'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('user agent handling', () => {
  it('classifies devices', () => {
    expect(classifyDevice(UA.iphone)).toBe('mobile');
    expect(classifyDevice(UA.androidPhone)).toBe('mobile');
    expect(classifyDevice(UA.androidTablet)).toBe('tablet');
    expect(classifyDevice(UA.ipad)).toBe('tablet');
    expect(classifyDevice(UA.mac)).toBe('desktop');
  });

  it('filters bots and lab tools', () => {
    expect(isBot(UA.googlebot)).toBe(true);
    expect(isBot(UA.lighthouse)).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot(UA.iphone)).toBe(false);
  });
});

describe('countryFromHeaders', () => {
  it('reads common CDN headers and ignores junk', () => {
    expect(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'de' }))).toBe('DE');
    expect(countryFromHeaders(new Headers({ 'x-country': 'IN' }))).toBe('IN');
    expect(countryFromHeaders(new Headers({ 'cf-ipcountry': 'XX' }))).toBeNull();
    expect(countryFromHeaders(new Headers({ 'cf-ipcountry': 'T1X' }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
  });
});

describe('originAllowed', () => {
  it('allows the site, its subdomains and localhost only', () => {
    expect(originAllowed('https://example.com', 'example.com')).toBe(true);
    expect(originAllowed('https://shop.example.com', 'example.com')).toBe(true);
    expect(originAllowed('http://localhost:5173', 'example.com')).toBe(true);
    expect(originAllowed(null, 'example.com')).toBe(true);
    expect(originAllowed('https://evil-example.com', 'example.com')).toBe(false);
    expect(originAllowed('https://example.com.evil.io', 'example.com')).toBe(false);
    expect(originAllowed('garbage', 'example.com')).toBe(false);
  });
});

describe('site settings validation', () => {
  it('normalises domains', () => {
    expect(normalizeDomain('https://www.Example.com/pricing')).toBe('example.com');
    expect(normalizeDomain('shop.example.co.uk')).toBe('shop.example.co.uk');
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });

  it('only allows public https webhooks', () => {
    expect(webhookAllowed(new URL('https://hooks.slack.com/services/T/B/x'))).toBe(true);
    expect(webhookAllowed(new URL('http://hooks.slack.com/x'))).toBe(false);
    expect(webhookAllowed(new URL('https://localhost/x'))).toBe(false);
    expect(webhookAllowed(new URL('https://169.254.169.254/latest/meta-data'))).toBe(false);
    expect(webhookAllowed(new URL('https://10.0.0.5/x'))).toBe(false);
    expect(webhookAllowed(new URL('https://[::1]/x'))).toBe(false);
  });
});

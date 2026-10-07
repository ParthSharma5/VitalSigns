import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Callback = (metric: { name: string; id: string; value: number; delta: number; entries: unknown[] }) => void;
const callbacks: Record<string, Callback> = {};

vi.mock('web-vitals', () => ({
  onLCP: (cb: Callback) => (callbacks.LCP = cb),
  onINP: (cb: Callback) => (callbacks.INP = cb),
  onCLS: (cb: Callback) => (callbacks.CLS = cb),
  onTTFB: (cb: Callback) => (callbacks.TTFB = cb),
}));

type Sent = { p: string; v: string; m: Array<{ n: string; i: string; x: number }> };
let sent: Sent[];
let events: EventTarget;
const location = { pathname: '/' };

const metric = (name: string, value: number, delta = value, startTime?: number) => ({
  name, id: `v5-${name}`, value, delta, entries: startTime == null ? [] : [{ startTime }],
});
const fire = (type: string) => events.dispatchEvent(new Event(type));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  sent = [];
  events = new EventTarget();
  location.pathname = '/';
  const go = (_state: unknown, _title: string, url?: string | URL | null) => {
    if (url) location.pathname = String(url);
  };
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', { pushState: go, replaceState: go });
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('navigator', {
    sendBeacon: (_url: string, body: string) => {
      sent.push(JSON.parse(body));
      return true;
    },
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    currentScript: { dataset: { site: 'vs_test', endpoint: 'https://vitals.test/api/collect' } },
  });
  // The initial view starts at time 0.
  vi.spyOn(performance, 'now').mockReturnValue(0);
  await import('../snippet/core');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('collector', () => {
  it('sends a few seconds after measuring, without waiting for the visitor to leave', () => {
    callbacks.TTFB(metric('TTFB', 180));
    callbacks.LCP(metric('LCP', 900));
    callbacks.LCP(metric('LCP', 1200));
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
    expect(sent[0].p).toBe('/');
    expect(sent[0].m.map((m) => [m.n, m.x])).toEqual([['TTFB', 180], ['LCP', 1200]]);
  });

  it('measures client-side navigations as separate page views', () => {
    callbacks.LCP(metric('LCP', 2000));
    callbacks.CLS(metric('CLS', 0.1));
    history.pushState(null, '', '/pricing');

    // Leaving "/" sends its metrics right away, under its own path.
    expect(sent).toHaveLength(1);
    const home = sent[0];
    expect(home.p).toBe('/');
    expect(home.m.map((m) => [m.n, m.x])).toEqual([['LCP', 2000], ['CLS', 0.1]]);

    callbacks.CLS(metric('CLS', 0.25, 0.15));
    callbacks.INP(metric('INP', 350));
    fire('pagehide');

    expect(sent).toHaveLength(2);
    const pricing = sent[1];
    expect(pricing.p).toBe('/pricing');
    expect(pricing.v).not.toBe(home.v);
    // Only the layout shift that happened on /pricing is credited to it.
    expect(pricing.m.map((m) => [m.n, m.x])).toEqual([['CLS', 0.15], ['INP', 350]]);
    expect(new Set([...home.m, ...pricing.m].map((m) => m.i)).size).toBe(4);
  });

  it('credits a late-reported interaction to the route it started on', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    history.pushState(null, '', '/cart');
    // The click happened at 500 ms, on "/", but is only reported once the visitor is on /cart.
    callbacks.INP(metric('INP', 400, 400, 500));
    fire('pagehide');
    const byPath = Object.fromEntries(sent.map((s) => [s.p, s.m.map((m) => [m.n, m.x])]));
    expect(byPath['/']).toEqual([['INP', 400]]);
    expect(byPath['/cart']).toEqual([['CLS', 0]]);
  });

  it('reports CLS 0 for a route without layout shifts, and ignores same-path history updates', () => {
    history.pushState(null, '', '/docs');
    history.replaceState(null, '', '/docs');
    fire('pagehide');
    expect(sent.map((s) => [s.p, s.m.map((m) => [m.n, m.x])])).toEqual([
      ['/', [['CLS', 0]]],
      ['/docs', [['CLS', 0]]],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { describeRegression, detectRegressions, type WindowStats } from '../lib/alerts';
import { formatValue, rate } from '../lib/metrics';
import type { PageDiagnostics } from '../lib/queries';
import { ruleBasedSuggestions } from '../lib/suggestions';

const stats = (o: Partial<WindowStats>): WindowStats => ({
  metric: 'LCP', baseline: 2000, current: 2000, baselineN: 100, currentN: 100,
  baselineRelease: 'v1', currentRelease: 'v1', ...o,
});

describe('detectRegressions', () => {
  it('flags a metric that got worse past the threshold', () => {
    const [r] = detectRegressions([stats({ current: 2800 })], 0.2);
    expect(r.metric).toBe('LCP');
    expect(r.change).toBeCloseTo(0.4);
    expect(r.release).toBeNull();
  });

  it('attributes the regression to a new release', () => {
    const [r] = detectRegressions([stats({ current: 2800, currentRelease: 'v2' })], 0.2);
    expect(r.release).toBe('v2');
  });

  it('ignores improvements, small changes, thin data and tiny absolute deltas', () => {
    expect(detectRegressions([stats({ current: 1500 })], 0.2)).toEqual([]);
    expect(detectRegressions([stats({ current: 2300 })], 0.2)).toEqual([]);
    expect(detectRegressions([stats({ current: 4000, currentN: 10 })], 0.2)).toEqual([]);
    expect(detectRegressions([stats({ baseline: null })], 0.2)).toEqual([]);
    expect(detectRegressions([stats({ metric: 'CLS', baseline: 0.01, current: 0.02 })], 0.2)).toEqual([]);
    expect(detectRegressions([stats({ metric: 'CLS', baseline: 0.05, current: 0.12 })], 0.2)).toHaveLength(1);
  });

  it('describes regressions in plain language', () => {
    const [r] = detectRegressions([stats({ current: 2800, currentRelease: 'v2' })], 0.2);
    expect(describeRegression(r, 'example.com')).toBe(
      'LCP got 40% worse since release v2 on example.com: p75 2.00 s → 2.80 s (needs improvement)',
    );
  });
});

describe('metrics', () => {
  it('rates against the Core Web Vitals thresholds (inclusive of the good bound)', () => {
    expect(rate('LCP', 2500)).toBe('good');
    expect(rate('LCP', 2501)).toBe('needs-improvement');
    expect(rate('LCP', 4001)).toBe('poor');
    expect(rate('INP', 200)).toBe('good');
    expect(rate('CLS', 0.26)).toBe('poor');
  });

  it('formats values for display', () => {
    expect(formatValue('LCP', 850)).toBe('850 ms');
    expect(formatValue('LCP', 2512)).toBe('2.51 s');
    expect(formatValue('CLS', 0.1234)).toBe('0.12');
    expect(formatValue('INP', null)).toBe('–');
  });
});

const page = (o: Partial<PageDiagnostics>): PageDiagnostics => ({
  path: '/p', views: 100, p75: { LCP: 1000, INP: 100, CLS: 0.01, TTFB: 200 }, culprits: {}, lcpByDevice: {}, ...o,
});

describe('ruleBasedSuggestions', () => {
  it('has nothing to say about a fast page', () => {
    expect(ruleBasedSuggestions(page({}))).toEqual([]);
  });

  it('recommends preloading a non-modern LCP image', () => {
    const [s] = ruleBasedSuggestions(
      page({
        p75: { LCP: 4200, INP: 100, CLS: 0.01, TTFB: 300 },
        culprits: { LCP: { target: 'img.hero', resource: 'https://x.com/hero.png', eventType: null, share: 0.9 } },
      }),
    );
    expect(s).toMatchObject({ metric: 'LCP', severity: 'poor' });
    expect(s.title).toContain('img.hero');
    expect(s.detail).toContain('rel="preload"');
    expect(s.detail).toContain('AVIF or WebP');
  });

  it('does not suggest converting images that are already modern formats', () => {
    const [s] = ruleBasedSuggestions(
      page({
        p75: { LCP: 3000, INP: 100, CLS: 0.01, TTFB: 300 },
        culprits: { LCP: { target: 'img', resource: 'https://x.com/a.avif', eventType: null, share: 1 } },
      }),
    );
    expect(s.detail).not.toContain('AVIF or WebP');
  });

  it('blames the server when TTFB is slow', () => {
    const out = ruleBasedSuggestions(page({ p75: { LCP: 3000, INP: 100, CLS: 0.01, TTFB: 1500 } }));
    expect(out[0].title).toMatch(/server response/i);
  });

  it('names the slow interaction and the shifting element', () => {
    const out = ruleBasedSuggestions(
      page({
        p75: { LCP: 1000, INP: 420, CLS: 0.2, TTFB: 200 },
        culprits: {
          INP: { target: 'button#pay', resource: null, eventType: 'click', share: 0.8 },
          CLS: { target: 'img.banner', resource: null, eventType: null, share: 0.7 },
        },
      }),
    );
    expect(out.map((s) => s.metric)).toEqual(['INP', 'CLS']);
    expect(out[0].title).toBe('Slow response to click on button#pay');
    expect(out[1].detail).toContain('width and height');
  });

  it('calls out a large mobile/desktop gap', () => {
    const out = ruleBasedSuggestions(
      page({ p75: { LCP: 3500, INP: 100, CLS: 0.01, TTFB: 300 }, lcpByDevice: { mobile: 4800, desktop: 1900 } }),
    );
    expect(out.some((s) => /mobile/i.test(s.title))).toBe(true);
  });
});

// VitalSigns collector. Injected by snippet/loader.ts (public/v1.js) and built
// to public/v1-core.<hash>.js by scripts/build-snippet.mjs.
//
// Design constraints (this file runs on other people's sites):
// - Never block rendering: fetched async at low priority, does no work until
//   the browser hands us metrics, and only touches the network when the page
//   is hidden (one beacon per page view, not one per metric).
// - Never throw into the host page: every entry point is wrapped.
// - web-vitals observers use `buffered: true`, so loading after the page has
//   started rendering still sees the LCP, layout-shift and event entries.
import { onCLS, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';

type Payload = {
  s: string; // site key
  p: string; // path
  v: string; // page view id
  r?: string; // release
  c?: string; // effective connection type
  m: Array<{ n: string; i: string; x: number; t?: string; u?: string; e?: string }>;
};

const script = document.currentScript as HTMLScriptElement | null;

// The entry fields we read. Declared here because TypeScript's DOM lib does not
// yet type LargestContentfulPaint / LayoutShift.
type Entry = PerformanceEntry & {
  element?: Element | null; // largest-contentful-paint
  url?: string; // largest-contentful-paint
  target?: Node | null; // event
  value?: number; // layout-shift
  sources?: Array<{ node?: Node | null }>; // layout-shift
};

// Short, stable-ish description of an element: tag#id or tag.firstClass.
function describe(node: Node | null | undefined): string | undefined {
  const el = node as Element | null | undefined;
  if (!el?.tagName) return;
  const tag = el.tagName.toLowerCase();
  if (el.id) return tag + '#' + el.id;
  const cls = el.classList?.[0];
  return (cls ? tag + '.' + cls : tag).slice(0, 80);
}

function attribution(metric: MetricType): Pick<Payload['m'][number], 't' | 'u' | 'e'> {
  const entries = metric.entries as Entry[];
  if (!entries.length) return {};
  if (metric.name === 'LCP') {
    const last = entries[entries.length - 1];
    return { t: describe(last.element), u: last.url ? last.url.slice(0, 200) : undefined };
  }
  if (metric.name === 'INP') {
    return { t: describe(entries[0].target), e: entries[0].name };
  }
  if (metric.name === 'CLS') {
    // The single largest shift is the one worth fixing.
    let worst = entries[0];
    for (const e of entries) if ((e.value ?? 0) > (worst.value ?? 0)) worst = e;
    return { t: describe(worst.sources?.[0]?.node) };
  }
  return {};
}

if (script && script.dataset.site && script.dataset.endpoint) {
  const site = script.dataset.site;
  const endpoint = script.dataset.endpoint;
  const sample = parseFloat(script.dataset.sample || '1');

  if (Math.random() < sample) {
    const view = Math.random().toString(36).slice(2, 12);
    // Keyed by metric id so a later, larger value (CLS, INP) replaces the
    // earlier one instead of being sent twice in the same beacon.
    const queue = new Map<string, Payload['m'][number]>();

    const add = (metric: MetricType) => {
      try {
        queue.set(metric.id, {
          n: metric.name,
          i: metric.id,
          x: metric.name === 'CLS' ? Math.round(metric.value * 1e4) / 1e4 : Math.round(metric.value),
          ...attribution(metric),
        });
      } catch {}
    };

    const flush = () => {
      if (!queue.size) return;
      try {
        const payload: Payload = {
          s: site,
          p: location.pathname,
          v: view,
          r: script.dataset.release,
          c: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType,
          m: [...queue.values()],
        };
        queue.clear();
        const body = JSON.stringify(payload);
        // text/plain keeps this a "simple" CORS request: no preflight.
        if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
          fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
        }
      } catch {}
    };

    onLCP(add);
    onINP(add);
    onCLS(add);
    onTTFB(add);
    addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    addEventListener('pagehide', flush);
  }
}

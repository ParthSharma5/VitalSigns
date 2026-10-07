import { onCLS, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';

type Payload = {
  s: string;
  p: string;
  v: string;
  r?: string;
  c?: string;
  a?: string;
  m: Array<{ n: string; i: string; x: number; t?: string; u?: string; e?: string }>;
};

const script = document.currentScript as HTMLScriptElement | null;

type Entry = PerformanceEntry & {
  element?: Element | null;
  url?: string;
  target?: Node | null;
  value?: number;
  sources?: Array<{ node?: Node | null }>;
};

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
    // A view is one page as the visitor saw it: the initial load, or a route reached by
    // client-side (SPA) navigation. Each has its own id and the path it was shown at.
    type View = { v: string; p: string; t: number; cls: number; inp: number; hasCls?: boolean };
    const views: View[] = [];
    const newView = (): View => {
      const v: View = { v: Math.random().toString(36).slice(2, 12), p: location.pathname, t: performance.now(), cls: 0, inp: 0 };
      views.push(v);
      if (views.length > 20) views.shift();
      return v;
    };
    let first = newView();
    let view = first;

    // Browsers report interactions and layout shifts a little after they happen, possibly after the
    // next client-side navigation, so credit them to the view that was showing when they started.
    const viewAt = (metric: MetricType): View => {
      const entries = metric.entries as Entry[];
      const time = entries.length ? entries[entries.length - 1].startTime : Infinity;
      for (let i = views.length - 1; i >= 0; i--) if (views[i].t <= time) return views[i];
      return view;
    };

    // Metrics wait here per view, keyed by metric id: a later value replaces an earlier one,
    // and the server upserts on the same id, so re-sending a metric never double counts.
    const queue = new Map<View, Map<string, Payload['m'][number]>>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = (target: View, metrics: Payload['m']) => {
      const payload: Payload = {
        s: site,
        p: target.p,
        v: target.v,
        r: script.dataset.release,
        a: script.dataset.user,
        c: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType,
        m: metrics,
      };
      const body = JSON.stringify(payload);
      if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
        fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    };

    const flush = () => {
      clearTimeout(timer);
      timer = undefined;
      queue.forEach((metrics, target) => {
        try {
          send(target, [...metrics.values()]);
        } catch {}
      });
      queue.clear();
    };

    const put = (target: View, m: Payload['m'][number]) => {
      if (m.n === 'CLS') target.hasCls = true;
      let metrics = queue.get(target);
      if (!metrics) queue.set(target, (metrics = new Map()));
      metrics.set(m.i, m);
      // Send a few seconds after measuring instead of waiting for the visitor to leave,
      // so a fresh install shows data almost immediately.
      timer ??= setTimeout(flush, 5000);
    };

    const record = (target: View, metric: MetricType, value: number, id: string) => {
      try {
        put(target, {
          n: metric.name,
          i: id,
          x: metric.name === 'CLS' ? Math.round(value * 1e4) / 1e4 : Math.round(value),
          ...attribution(metric),
        });
      } catch {}
    };

    // Every view reports a CLS value, even 0, so routes without shifts still count.
    const end = () => {
      if (!view.hasCls) put(view, { n: 'CLS', i: view.v + '-CLS', x: Math.round(view.cls * 1e4) / 1e4 });
      flush();
    };

    // A page restored from the back/forward cache is a new view; web-vitals measures it afresh.
    // Registered before the web-vitals listeners so their reports already land on the new view.
    addEventListener('pageshow', (e) => {
      if (e.persisted) {
        views.length = 0;
        first = view = newView();
      }
    });

    // LCP and TTFB only exist for the initial load.
    onLCP((m) => record(first, m, m.value, m.id), { reportAllChanges: true });
    onTTFB((m) => record(first, m, m.value, m.id));
    // CLS and INP keep running across client-side navigations, so each change is credited
    // to the route it happened on. INP only reports when it gets worse for the whole page,
    // so a later route only gets an INP value if it had the page's slowest interaction so far.
    onCLS(
      (m) => {
        const target = viewAt(m);
        target.cls += m.delta;
        record(target, m, target.cls, target.v + '-CLS');
      },
      { reportAllChanges: true },
    );
    onINP(
      (m) => {
        const target = viewAt(m);
        if (m.value <= target.inp) return;
        target.inp = m.value;
        record(target, m, m.value, target.v + '-INP');
      },
      { reportAllChanges: true },
    );

    // Client-side navigation: close the current view and start one for the new path.
    const route = () => {
      if (location.pathname === view.p) return;
      end();
      view = newView();
    };
    for (const k of ['pushState', 'replaceState'] as const) {
      const original = history[k];
      history[k] = function (this: History, ...args: Parameters<History['pushState']>) {
        original.apply(this, args);
        route();
      };
    }
    addEventListener('popstate', route);

    addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && end());
    addEventListener('pagehide', end);
  }
}

// VitalSigns loader: the script tag site owners paste (public/v1.js).
//
// It does one thing: inject the collector (web-vitals + batching) as an async,
// low-priority script so it never competes with the host page's own critical
// requests. The collector's filename is content-hashed, so it can be cached
// forever while this loader stays short-lived and picks up new versions.
declare const __CORE_FILE__: string;

const s = document.currentScript as HTMLScriptElement | null;
if (s && s.dataset.site) {
  const c = document.createElement('script');
  c.src = new URL(__CORE_FILE__, s.src).href;
  c.async = true;
  c.setAttribute('fetchpriority', 'low');
  Object.assign(c.dataset, s.dataset);
  if (!s.dataset.endpoint) c.dataset.endpoint = new URL('/api/collect', s.src).href;
  document.head.appendChild(c);
}

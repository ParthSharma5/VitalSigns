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

import { METRIC_INFO, formatValue, rate, type MetricName } from './metrics';
import type { PageDiagnostics } from './queries';

export type Suggestion = {
  metric: MetricName;
  severity: 'poor' | 'needs-improvement';
  title: string;
  detail: string;
  evidence: string; // the data that triggered this suggestion
};

// Anything that turns page diagnostics into fixes implements this. The
// built-in provider is deterministic rules over the attribution data the
// snippet collects; an AI-backed provider can implement the same interface.
export interface SuggestionProvider {
  readonly name: string;
  suggest(page: PageDiagnostics): Promise<Suggestion[]>;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const isImage = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url) || /\/_next\/image|imgix|cloudinary|images?\//i.test(url);
const isModernFormat = (url: string) => /\.(webp|avif)(\?|$)|[?&](fm|format)=(webp|avif)|\/_next\/image/i.test(url);
const isFontLike = (target: string) => /^(h[1-6]|p|span|div|li|a|blockquote)\b/.test(target);

function severityOf(metric: MetricName, value: number | null): Suggestion['severity'] | null {
  if (value == null) return null;
  const r = rate(metric, value);
  return r === 'good' ? null : r;
}

export function ruleBasedSuggestions(page: PageDiagnostics): Suggestion[] {
  const out: Suggestion[] = [];

  // --- LCP -----------------------------------------------------------------
  const lcpSeverity = severityOf('LCP', page.p75.LCP);
  const ttfb = page.p75.TTFB;
  if (lcpSeverity) {
    const lcpEvidence = `LCP p75 ${formatValue('LCP', page.p75.LCP)}`;
    const culprit = page.culprits.LCP;

    if (ttfb != null && ttfb > METRIC_INFO.TTFB.good) {
      out.push({
        metric: 'LCP',
        severity: lcpSeverity,
        title: 'Slow server response is eating the LCP budget',
        detail:
          `Time to first byte alone is ${formatValue('TTFB', ttfb)} at p75, before the browser can start on anything else. ` +
          'Cache the HTML at the CDN edge (or use ISR / static generation), check for slow database queries or API calls in the render path, and avoid redirects before the final URL.',
        evidence: `${lcpEvidence}, TTFB p75 ${formatValue('TTFB', ttfb)}`,
      });
    }

    if (culprit?.resource && isImage(culprit.resource)) {
      const steps = [
        `add <link rel="preload" as="image" href="${culprit.resource}" fetchpriority="high"> (or fetchpriority="high" on the <img>)`,
        'make sure it is not loading="lazy"',
        isModernFormat(culprit.resource) ? null : 'serve it as AVIF or WebP',
        'size it with srcset/sizes so mobile does not download the desktop asset',
      ].filter(Boolean);
      out.push({
        metric: 'LCP',
        severity: lcpSeverity,
        title: `The LCP element is an image${culprit.target ? ` (${culprit.target})` : ''}`,
        detail: `On ${pct(culprit.share)} of slow loads the largest paint is ${culprit.resource}. To get it on screen sooner: ${steps.join('; ')}.`,
        evidence: lcpEvidence,
      });
    } else if (culprit?.target && !culprit.resource && isFontLike(culprit.target)) {
      out.push({
        metric: 'LCP',
        severity: lcpSeverity,
        title: `The LCP element is text (${culprit.target})`,
        detail:
          'Text LCP is usually held back by render-blocking CSS or web fonts. Inline critical CSS, preload the font file used by this element, and use font-display: swap (or optional) so text paints with a fallback font.',
        evidence: `${lcpEvidence}; ${pct(culprit.share)} of slow loads`,
      });
    } else if (culprit?.target) {
      out.push({
        metric: 'LCP',
        severity: lcpSeverity,
        title: `Speed up the LCP element (${culprit.target})`,
        detail:
          'If this element is rendered by client-side JavaScript, server-render it so it is in the initial HTML. Remove render-blocking scripts from <head> (defer or async) and preload any resource it depends on.',
        evidence: `${lcpEvidence}; ${pct(culprit.share)} of slow loads`,
      });
    }

    const mobile = page.lcpByDevice.mobile;
    const desktop = page.lcpByDevice.desktop;
    if (mobile != null && desktop != null && mobile > desktop * 1.75 && mobile > METRIC_INFO.LCP.good) {
      out.push({
        metric: 'LCP',
        severity: lcpSeverity,
        title: 'Mobile is far slower than desktop',
        detail:
          `Mobile LCP p75 is ${formatValue('LCP', mobile)} against ${formatValue('LCP', desktop)} on desktop. ` +
          'Mobile CPUs and networks amplify heavy pages: cut JavaScript shipped to mobile (code-split, drop unused dependencies), use responsive images, and test with CPU throttling.',
        evidence: `mobile ${formatValue('LCP', mobile)} vs desktop ${formatValue('LCP', desktop)}`,
      });
    }
  }

  // --- INP -----------------------------------------------------------------
  const inpSeverity = severityOf('INP', page.p75.INP);
  if (inpSeverity) {
    const culprit = page.culprits.INP;
    const what = culprit?.eventType
      ? `${culprit.eventType} on ${culprit.target ?? 'an element'}`
      : (culprit?.target ?? 'user interactions');
    out.push({
      metric: 'INP',
      severity: inpSeverity,
      title: `Slow response to ${what}`,
      detail:
        'The handler (or work it triggers) blocks the main thread before the next frame. Do the visual update first and defer the rest: await scheduler.yield() or setTimeout between steps, move heavy work to a Web Worker, debounce input handlers, and avoid re-rendering large component trees on each interaction.',
      evidence: `INP p75 ${formatValue('INP', page.p75.INP)}${culprit ? `; ${pct(culprit.share)} of slow interactions` : ''}`,
    });
  }

  // --- CLS -----------------------------------------------------------------
  const clsSeverity = severityOf('CLS', page.p75.CLS);
  if (clsSeverity) {
    const culprit = page.culprits.CLS;
    const target = culprit?.target;
    const isMedia = target && /^(img|video|iframe|picture)\b/.test(target);
    out.push({
      metric: 'CLS',
      severity: clsSeverity,
      title: target ? `Layout shifts from ${target}` : 'Content moves after it renders',
      detail: isMedia
        ? 'Give the media explicit width and height attributes (or a CSS aspect-ratio) so the browser reserves its space before it loads.'
        : 'Reserve space for content that arrives late (banners, embeds, ads, cookie notices) with min-height, avoid inserting content above existing content, and use font-display: optional or size-adjusted fallback fonts to stop text reflow.',
      evidence: `CLS p75 ${formatValue('CLS', page.p75.CLS)}${culprit ? `; ${pct(culprit.share)} of shifting loads` : ''}`,
    });
  }

  return out;
}

export const ruleBasedProvider: SuggestionProvider = {
  name: 'rules',
  suggest: async (page) => ruleBasedSuggestions(page),
};

// Single place to swap in a different provider later.
export function getSuggestionProvider(): SuggestionProvider {
  return ruleBasedProvider;
}

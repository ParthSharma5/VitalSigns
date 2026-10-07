import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckAlertsButton } from '@/components/check-alerts-button';
import { DEVICES, DEVICE_LABEL, FilterGroup, RANGE_LABEL, countryName } from '@/components/filters';
import { DistributionBar } from '@/components/charts/distribution-bar';
import { Sparkline } from '@/components/charts/sparkline';
import { TrendChart } from '@/components/charts/trend-chart';
import { Card, MetricCell, RatingBadge } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { CORE_METRICS, METRIC_INFO, METRICS, formatValue, rate, type MetricName } from '@/lib/metrics';
import {
  RANGES, getAlerts, getBreakdown, getDiagnostics, getPages, getSummary, getTrends,
  type BreakdownRow, type DeviceFilter, type MetricSummary, type RangeKey,
} from '@/lib/queries';
import { getSiteForUser } from '@/lib/sites';
import { getSuggestionProvider } from '@/lib/suggestions';

export const metadata: Metadata = { title: 'Overview' };

export default async function SiteOverview(props: PageProps<'/dashboard/[siteId]'>) {
  const [{ siteId }, sp, user] = await Promise.all([props.params, props.searchParams, requireUser()]);
  const site = await getSiteForUser(siteId, user.id);
  const range: RangeKey = typeof sp.range === 'string' && sp.range in RANGES ? (sp.range as RangeKey) : '7d';
  const device: DeviceFilter = DEVICES.includes(sp.device as DeviceFilter) ? (sp.device as DeviceFilter) : 'all';
  const filter = { siteId: site.id, range, device };

  const [summary, trends, pages, devices, countries, alerts] = await Promise.all([
    getSummary(filter),
    getTrends(filter),
    getPages(filter),
    getBreakdown({ ...filter, device: 'all' }, 'device'),
    getBreakdown(filter, 'country'),
    getAlerts(site.id),
  ]);

  const hrefWith = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ range, device, ...patch });
    return `/dashboard/${site.id}?${q}`;
  };

  const provider = getSuggestionProvider();
  const diagnostics = await getDiagnostics(filter, pages.slice(0, 8));
  const suggestions = (
    await Promise.all(diagnostics.map(async (d) => ({ page: d, items: await provider.suggest(d) })))
  )
    .filter((s) => s.items.length > 0)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <FilterGroup
          label="Time range"
          options={(Object.keys(RANGES) as RangeKey[]).map((r) => ({ href: hrefWith({ range: r }), label: RANGE_LABEL[r], active: r === range }))}
        />
        <FilterGroup
          label="Device"
          options={DEVICES.map((d) => ({ href: hrefWith({ device: d }), label: DEVICE_LABEL[d], active: d === device }))}
        />
        <span className="ml-auto text-sm text-muted tabular">{summary.views.toLocaleString()} page views</span>
      </div>

      {summary.views === 0 ? (
        <Card title="No data for this period yet">
          <p className="text-sm text-ink-2">
            Once the script tag is on your site, visits show up here within a minute of each visitor leaving a page.{' '}
            <Link href={`/dashboard/${site.id}/settings`} className="font-medium text-accent-ink hover:underline">
              Get the script tag
            </Link>
            {range !== '30d' && (
              <>
                {' '}or{' '}
                <Link href={hrefWith({ range: '30d' })} className="font-medium text-accent-ink hover:underline">
                  look at the last 30 days
                </Link>
              </>
            )}
            .
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <StatTile key={m} s={summary.metrics[m]} trend={trends[m].map((p) => p.p75)} range={range} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {CORE_METRICS.map((m) => (
              <Card key={m} title={`${METRIC_INFO[m].long} (${m})`} subtitle={`p75 per ${range === '24h' ? 'hour' : 'day'}`}>
                <TrendChart metric={m} points={trends[m]} hourly={range === '24h'} />
              </Card>
            ))}
          </div>

          <Card
            title="Slowest pages"
            subtitle="Ranked by p75 LCP. Pages with fewer than 3 views are hidden."
          >
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-5 py-2 font-medium">Page</th>
                    <th className="px-3 py-2 text-right font-medium">Views</th>
                    {METRICS.map((m) => <th key={m} className="px-3 py-2 font-medium">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.path} className="border-b border-line last:border-0">
                      <td className="max-w-[280px] truncate px-5 py-2.5 font-mono text-xs" title={p.path}>{p.path}</td>
                      <td className="px-3 py-2.5 text-right text-ink-2 tabular">{p.views.toLocaleString()}</td>
                      {METRICS.map((m) => <td key={m} className="px-3 py-2.5"><MetricCell metric={m} value={p[m]} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Suggested fixes"
            subtitle="Generated from what the snippet measured on each page: the LCP element, slow interactions and layout shifts."
          >
            {suggestions.length === 0 ? (
              <p className="text-sm text-ink-2">Nothing to fix on your busiest pages: every metric is in the good range.</p>
            ) : (
              <div className="space-y-6">
                {suggestions.map(({ page, items }) => (
                  <div key={page.path}>
                    <h3 className="font-mono text-xs font-medium text-ink">{page.path}</h3>
                    <ul className="mt-2 space-y-2">
                      {items.map((s, i) => (
                        <li key={i} className="rounded-lg border border-line p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <RatingBadge rating={s.severity} compact />
                            <span className="text-xs font-semibold text-muted">{s.metric}</span>
                            <span className="text-sm font-medium">{s.title}</span>
                          </div>
                          <p className="mt-1.5 text-sm text-ink-2">{s.detail}</p>
                          <p className="mt-1 text-xs text-muted">Based on: {s.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="By device" subtitle="All devices, regardless of the device filter.">
              <BreakdownTable rows={devices} label={(k) => k[0].toUpperCase() + k.slice(1)} />
            </Card>
            <Card title="By country" subtitle="Top countries by page views.">
              <BreakdownTable rows={countries} label={countryName} />
            </Card>
          </div>
        </>
      )}

      <Card
        title="Regression alerts"
        subtitle={`Checked hourly: p75 over the last 24 hours against the 24 hours before. Fires at ${Math.round(site.alert_threshold * 100)}% worse.`}
        action={<CheckAlertsButton siteId={site.id} />}
      >
        {alerts.length === 0 ? (
          <p className="text-sm text-ink-2">No regressions detected.</p>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <RatingBadge rating={rate(a.metric, a.current)} compact />
                  <span>
                    <strong className="font-semibold">{a.metric}</strong> got{' '}
                    <strong className="font-semibold text-poor-ink">{Math.round(a.change * 100)}% worse</strong>{' '}
                    {a.release ? <>since release <code className="font-mono text-xs">{a.release}</code></> : 'since the day before'}
                    <span className="text-ink-2 tabular">
                      {' '}({formatValue(a.metric, a.baseline)} → {formatValue(a.metric, a.current)})
                    </span>
                  </span>
                </span>
                <time className="text-xs text-muted" dateTime={new Date(a.created_at).toISOString()}>
                  {new Date(a.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatTile({ s, trend, range }: { s: MetricSummary; trend: Array<number | null>; range: RangeKey }) {
  const info = METRIC_INFO[s.metric];
  const change = s.p75 != null && s.prevP75 ? (s.p75 - s.prevP75) / s.prevP75 : null;
  const deltaClass = change == null || Math.abs(change) < 0.02 ? 'text-muted' : change > 0 ? 'text-poor-ink' : 'text-good-ink';
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm text-ink-2" title={info.long}>
          {s.metric === 'TTFB' ? 'Time to first byte' : info.long}
        </h2>
        {s.p75 != null && <RatingBadge rating={rate(s.metric, s.p75)} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-3xl font-semibold tracking-tight">{formatValue(s.metric, s.p75)}</div>
          <div className={`mt-1 text-xs ${deltaClass}`}>
            {change == null
              ? `p75 · ${s.n.toLocaleString()} samples`
              : `${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}% vs previous ${range}`}
          </div>
        </div>
        <Sparkline values={trend} />
      </div>
      <div className="mt-4">
        <DistributionBar good={s.good} needsImprovement={s.needsImprovement} poor={s.poor} />
      </div>
    </section>
  );
}

function BreakdownTable({ rows, label }: { rows: BreakdownRow[]; label: (key: string) => string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No data.</p>;
  const total = rows.reduce((sum, r) => sum + r.views, 0);
  const shown: MetricName[] = ['LCP', 'INP', 'CLS'];
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-5 py-2 font-medium" />
            <th className="px-3 py-2 font-medium">Share of views</th>
            {shown.map((m) => <th key={m} className="px-3 py-2 font-medium">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = total ? r.views / total : 0;
            return (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">{label(r.key)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, share * 100)}%` }} />
                    </div>
                    <span className="text-xs text-ink-2 tabular">{Math.round(share * 100)}%</span>
                  </div>
                </td>
                {shown.map((m) => <td key={m} className="px-3 py-2.5"><MetricCell metric={m} value={r[m]} /></td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

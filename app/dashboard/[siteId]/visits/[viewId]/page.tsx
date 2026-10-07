import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { countryName } from '@/components/filters';
import { Card, RatingBadge } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { METRIC_INFO, formatValue, rate } from '@/lib/metrics';
import { getSiteForUser } from '@/lib/sites';
import { getVisit } from '@/lib/visits';

export const metadata: Metadata = { title: 'Visit' };

export default async function VisitPage(props: PageProps<'/dashboard/[siteId]/visits/[viewId]'>) {
  const [{ siteId, viewId }, user] = await Promise.all([props.params, requireUser()]);
  const site = await getSiteForUser(siteId, user.id);
  const visit = await getVisit(site.id, decodeURIComponent(viewId).slice(0, 32));
  if (!visit) notFound();

  const context = [
    { label: 'Time', value: visit.at.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) },
    { label: 'Page', value: visit.path, mono: true },
    { label: 'Device', value: visit.device[0].toUpperCase() + visit.device.slice(1) },
    { label: 'Country', value: countryName(visit.country) },
    { label: 'Connection', value: visit.connection ?? 'Unknown' },
    { label: 'Release', value: visit.release ?? '–', mono: true },
    { label: 'User ID', value: visit.userId ?? 'Anonymous', mono: !!visit.userId },
  ];

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${site.id}/visits`} className="text-sm text-muted hover:text-ink">← All visits</Link>

      <Card title="Visit details" subtitle="Everything the snippet measured during this single page view.">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {context.map((c) => (
            <div key={c.label}>
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className={`mt-0.5 break-all text-ink ${c.mono ? 'font-mono text-xs' : ''}`}>{c.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {visit.metrics.map((m) => {
          const info = METRIC_INFO[m.metric];
          const r = rate(m.metric, m.value);
          const what =
            m.metric === 'LCP'
              ? m.target && `Largest element: ${m.target}`
              : m.metric === 'INP'
                ? m.target && `Slowest interaction: ${m.eventType ?? 'input'} on ${m.target}`
                : m.metric === 'CLS'
                  ? m.target && `Biggest shift: ${m.target}`
                  : null;
          return (
            <section key={m.metric} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm text-ink-2">{info.long} ({m.metric})</h2>
                <RatingBadge rating={r} />
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{formatValue(m.metric, m.value)}</div>
              <p className="mt-1 text-xs text-muted">
                Good is ≤ {formatValue(m.metric, info.good)}
              </p>
              {(what || m.resource) && (
                <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                  {what && <p className="font-mono text-xs text-ink">{what}</p>}
                  {m.resource && <p className="break-all font-mono text-xs text-ink-2">{m.resource}</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

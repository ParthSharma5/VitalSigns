import type { Metadata } from 'next';
import Link from 'next/link';
import { DEVICES, DEVICE_LABEL, FilterGroup, RANGE_LABEL, countryName } from '@/components/filters';
import { LocalTime } from '@/components/local-time';
import { Card, MetricCell } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { RANGES, type DeviceFilter, type RangeKey } from '@/lib/queries';
import { getSiteForUser } from '@/lib/sites';
import { getSlowestUsers, getVisits } from '@/lib/visits';

export const metadata: Metadata = { title: 'Visits' };

export default async function VisitsPage(props: PageProps<'/dashboard/[siteId]/visits'>) {
  const [{ siteId }, sp, user] = await Promise.all([props.params, props.searchParams, requireUser()]);
  const site = await getSiteForUser(siteId, user.id);

  const range: RangeKey = typeof sp.range === 'string' && sp.range in RANGES ? (sp.range as RangeKey) : '7d';
  const device: DeviceFilter = DEVICES.includes(sp.device as DeviceFilter) ? (sp.device as DeviceFilter) : 'all';
  const slowOnly = sp.slow === '1';
  const userFilter = typeof sp.user === 'string' && sp.user ? sp.user.slice(0, 64) : null;
  const beforeRaw = typeof sp.before === 'string' ? new Date(sp.before) : null;
  const before = beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : null;

  const [{ visits, nextBefore }, slowestUsers] = await Promise.all([
    getVisits({ siteId: site.id, range, device, slowOnly, user: userFilter, before }),
    userFilter ? Promise.resolve([]) : getSlowestUsers({ siteId: site.id, range, device }),
  ]);

  const base = `/dashboard/${site.id}/visits`;
  const hrefWith = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const state: Record<string, string | null> = {
      range, device, slow: slowOnly ? '1' : null, user: userFilter, ...patch,
    };
    for (const [k, v] of Object.entries(state)) if (v) q.set(k, v);
    return `${base}?${q}`;
  };

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
        <FilterGroup
          label="Speed"
          options={[
            { href: hrefWith({ slow: null }), label: 'All visits', active: !slowOnly },
            { href: hrefWith({ slow: '1' }), label: 'Slow only', active: slowOnly },
          ]}
        />
        {userFilter && (
          <Link
            href={hrefWith({ user: null })}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-ink hover:bg-accent/15"
          >
            User <code className="font-mono text-xs">{userFilter}</code>
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Clear user filter</span>
          </Link>
        )}
      </div>

      {slowestUsers.length > 0 && (
        <Card
          title="Logged-in users with the slowest experience"
          subtitle="Only visits where your site sent a data-user ID. p75 per user, slowest LCP first."
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">User ID</th>
                  <th className="px-3 py-2 text-right font-medium">Visits</th>
                  <th className="px-3 py-2 font-medium">LCP</th>
                  <th className="px-3 py-2 font-medium">INP</th>
                  <th className="px-3 py-2 font-medium">CLS</th>
                  <th className="px-5 py-2 font-medium">Last visit</th>
                </tr>
              </thead>
              <tbody>
                {slowestUsers.map((u) => (
                  <tr key={u.userId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={hrefWith({ user: u.userId, before: null })} className="font-mono text-xs text-accent-ink hover:underline">
                        {u.userId}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{u.visits.toLocaleString()}</td>
                    <td className="px-3 py-2.5"><MetricCell metric="LCP" value={u.LCP} /></td>
                    <td className="px-3 py-2.5"><MetricCell metric="INP" value={u.INP} /></td>
                    <td className="px-3 py-2.5"><MetricCell metric="CLS" value={u.CLS} /></td>
                    <td className="px-5 py-2.5 text-ink-2"><LocalTime value={u.lastSeen.toISOString()} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title={slowOnly ? 'Slow visits' : 'Visits'}
        subtitle="One row per page view, newest first. Visitors are anonymous; open a visit to see what made it slow."
      >
        {visits.length === 0 ? (
          <p className="text-sm text-ink-2">
            {before ? 'No older visits in this period.' : 'No visits match these filters yet.'}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Country</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">LCP</th>
                  <th className="px-3 py-2 font-medium">INP</th>
                  <th className="px-3 py-2 font-medium">CLS</th>
                  <th className="px-5 py-2"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.viewId} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-2 tabular"><LocalTime value={v.at.toISOString()} /></td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-mono text-xs" title={v.path}>{v.path}</td>
                    <td className="px-3 py-2.5 capitalize text-ink-2">{v.device}</td>
                    <td className="px-3 py-2.5 text-ink-2">{countryName(v.country)}</td>
                    <td className="px-3 py-2.5">
                      {v.userId ? (
                        <Link href={hrefWith({ user: v.userId, before: null })} className="font-mono text-xs text-accent-ink hover:underline">
                          {v.userId}
                        </Link>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><MetricCell metric="LCP" value={v.LCP} /></td>
                    <td className="px-3 py-2.5"><MetricCell metric="INP" value={v.INP} /></td>
                    <td className="px-3 py-2.5"><MetricCell metric="CLS" value={v.CLS} /></td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`${base}/${encodeURIComponent(v.viewId)}`} className="text-sm font-medium text-accent-ink hover:underline">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(nextBefore || before) && (
          <div className="mt-4 flex gap-3 text-sm">
            {before && (
              <Link href={hrefWith({ before: null })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">
                ← Newest
              </Link>
            )}
            {nextBefore && (
              <Link href={hrefWith({ before: nextBefore })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">
                Load older →
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

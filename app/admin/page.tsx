import type { Metadata } from 'next';
import { AppHeader } from '@/components/site-header';
import { LocalTime } from '@/components/local-time';
import { Card } from '@/components/ui';
import { getAdminOverview, requireAdmin } from '@/lib/admin';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

function timeAgo(d: Date | string | null): string {
  if (!d) return 'Never';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const { totals, users, sites } = await getAdminOverview();

  const stats = [
    { label: 'Users', value: totals.users },
    { label: 'Sites', value: totals.sites },
    { label: 'Sites with data (7 days)', value: totals.active_sites_7d },
    { label: 'Events (24 hours)', value: totals.events_24h },
    { label: 'Events (all time)', value: totals.events },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader user={admin} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <section key={s.label} className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm text-ink-2">{s.label}</h2>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{s.value.toLocaleString()}</div>
            </section>
          ))}
        </div>

        <Card title={`Users (${users.length})`} subtitle="Last seen is the most recent login.">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 text-right font-medium">Sites</th>
                  <th className="px-3 py-2 text-right font-medium">Events (7 days)</th>
                  <th className="px-5 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">{u.email}</td>
                    <td className="px-3 py-2.5 text-ink-2"><LocalTime value={new Date(u.created_at).toISOString()} format="date" /></td>
                    <td className="px-3 py-2.5 text-right tabular">{u.sites}</td>
                    <td className="px-3 py-2.5 text-right tabular">{u.events_7d.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-ink-2">{timeAgo(u.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Sites (${sites.length})`} subtitle="Sorted by most recent data. A site with no data has not installed the script tag yet.">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Site</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 text-right font-medium">Page views (7 days)</th>
                  <th className="px-3 py-2 text-right font-medium">Events (24 hours)</th>
                  <th className="px-3 py-2 text-right font-medium">Events (all)</th>
                  <th className="px-3 py-2 text-right font-medium">Alerts</th>
                  <th className="px-5 py-2 font-medium">Last data</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted">{s.domain}</div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{s.owner}</td>
                    <td className="px-3 py-2.5 text-ink-2"><LocalTime value={new Date(s.created_at).toISOString()} format="date" /></td>
                    <td className="px-3 py-2.5 text-right tabular">{s.views_7d.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular">{s.events_24h.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular">{s.events.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular">{s.alerts}</td>
                    <td className="px-5 py-2.5">
                      {s.last_event ? (
                        <span className="text-ink-2">{timeAgo(s.last_event)}</span>
                      ) : (
                        <span className="text-muted">Not installed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

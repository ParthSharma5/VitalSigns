import type { Metadata } from 'next';
import Link from 'next/link';
import { NewSiteForm } from '@/components/new-site-form';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { listSites } from '@/lib/sites';

export const metadata: Metadata = { title: 'Sites' };

export default async function SitesPage() {
  const user = await requireUser();
  const sites = await listSites(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>

      {sites.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <li key={site.id}>
              <Link
                href={`/dashboard/${site.id}`}
                className="block rounded-xl border border-line bg-surface p-5 transition hover:border-accent"
              >
                <div className="font-semibold">{site.name}</div>
                <div className="text-sm text-muted">{site.domain}</div>
                <div className="mt-3 text-sm text-ink-2 tabular">
                  {site.views_7d > 0 ? `${site.views_7d.toLocaleString()} page views, last 7 days` : 'Waiting for first data'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card title={sites.length ? 'Add another site' : 'Add your first site'} subtitle="You will get a script tag to paste into it.">
        <NewSiteForm />
      </Card>
    </div>
  );
}

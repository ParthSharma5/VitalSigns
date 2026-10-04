import Link from 'next/link';
import { SiteTabs } from '@/components/site-tabs';
import { requireUser } from '@/lib/auth';
import { getSiteForUser } from '@/lib/sites';

export default async function SiteLayout({ children, params }: LayoutProps<'/dashboard/[siteId]'>) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSiteForUser(siteId, user.id);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← All sites</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
            <p className="text-sm text-muted">{site.domain}</p>
          </div>
          <SiteTabs siteId={site.id} />
        </div>
      </div>
      {children}
    </div>
  );
}

import type { Metadata } from 'next';
import { CopySnippet } from '@/components/copy-snippet';
import { DeleteSiteForm, SiteSettingsForm } from '@/components/site-settings-form';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { appOrigin } from '@/lib/origin';
import { getSiteForUser } from '@/lib/sites';

export const metadata: Metadata = { title: 'Install & settings' };

export default async function SettingsPage(props: PageProps<'/dashboard/[siteId]/settings'>) {
  const [{ siteId }, sp, user] = await Promise.all([props.params, props.searchParams, requireUser()]);
  const site = await getSiteForUser(siteId, user.id);
  const origin = await appOrigin();
  const snippet = `<script defer src="${origin}/v1.js" data-site="${site.public_key}"></script>`;

  return (
    <div className="space-y-6">
      {sp.new && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink">
          Site created. Add the script tag below and data will start arriving with your next visitor.
        </p>
      )}

      <Card title="Install" subtitle="Paste into the <head> of every page, or your layout / template.">
        <CopySnippet code={snippet} />
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium">Optional: data-release</dt>
            <dd className="mt-1 text-ink-2">
              Set to your build or git SHA (<code className="font-mono text-xs">data-release=&quot;v2.3.1&quot;</code>) and alerts will say
              which release made things worse.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Optional: data-sample</dt>
            <dd className="mt-1 text-ink-2">
              On busy sites, measure a fraction of visits: <code className="font-mono text-xs">data-sample=&quot;0.25&quot;</code>.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Optional: data-user</dt>
            <dd className="mt-1 text-ink-2">
              For logged-in visitors, render their internal user ID into the tag (
              <code className="font-mono text-xs">data-user=&quot;u_123&quot;</code>) to see which users get the slowest experience.
              Never an email or phone number: those are dropped automatically. Mention it in your privacy policy.
            </dd>
          </div>
          <div>
            <dt className="font-medium">What it costs your page</dt>
            <dd className="mt-1 text-ink-2">
              A ~250 B loader, then a ~4 KB collector fetched async at low priority. One beacon per page view, sent when the visitor
              leaves.
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Settings">
        <SiteSettingsForm site={site} />
      </Card>

      <Card title="Delete site">
        <DeleteSiteForm siteId={site.id} />
      </Card>
    </div>
  );
}

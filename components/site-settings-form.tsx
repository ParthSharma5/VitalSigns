'use client';

import { useActionState, useState } from 'react';
import { deleteSite, updateSite } from '@/app/actions';
import { Button, Field, FormMessage, inputClass } from '@/components/ui';
import type { Site } from '@/lib/sites';

export function SiteSettingsForm({ site }: { site: Site }) {
  const [state, action, pending] = useActionState(updateSite.bind(null, site.id), undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" defaultValue={site.name} required className={inputClass} />
        </Field>
        <Field label="Domain" hint="Beacons from other domains are rejected. Subdomains and localhost are allowed.">
          <input name="domain" defaultValue={site.domain} required className={inputClass} />
        </Field>
      </div>
      <Field label="Alert when a metric gets worse by" hint="Compares p75 over the last 24 hours with the 24 hours before. Needs 30+ samples on each side.">
        <div className="flex items-center gap-2">
          <input
            name="threshold"
            type="number"
            min={5}
            max={500}
            step={5}
            defaultValue={Math.round(site.alert_threshold * 100)}
            className={`${inputClass} w-24`}
          />
          <span className="text-sm text-ink-2">%</span>
        </div>
      </Field>
      <Field label="Webhook URL (optional)" hint="Slack incoming webhooks and anything else that accepts a JSON {text} body.">
        <input
          name="webhook"
          type="url"
          defaultValue={site.webhook_url ?? ''}
          placeholder="https://hooks.slack.com/services/…"
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="alertEmail" defaultChecked={site.alert_email} className="size-4 accent-[var(--accent)]" />
        Email me when an alert fires
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteSiteForm({ siteId }: { siteId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form action={deleteSite.bind(null, siteId)} className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-4" />
        I understand this permanently deletes the site and all of its data.
      </label>
      <Button type="submit" variant="danger" disabled={!confirmed}>Delete site</Button>
    </form>
  );
}

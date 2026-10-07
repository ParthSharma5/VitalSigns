import Link from 'next/link';
import { AutoRefresh } from '@/components/auto-refresh';
import { LocalTime } from '@/components/local-time';
import type { InstallStatus as Status } from '@/lib/sites';

export function InstallStatus({ status, siteId, domain }: { status: Status; siteId: string; domain: string }) {
  const { lastEventAt, lastPath, rejectedOrigin, rejectedAt } = status;
  const rejected = rejectedOrigin && rejectedAt && (!lastEventAt || rejectedAt > lastEventAt);

  return (
    <div className="space-y-3">
      {rejected && (
        <div className="rounded-lg border border-poor/40 bg-poor/10 px-4 py-3 text-sm text-ink">
          <p className="font-medium">
            Data from <code className="font-mono text-xs">{rejectedOrigin}</code> is being rejected.
          </p>
          <p className="mt-1 text-ink-2">
            It doesn&apos;t match this site&apos;s domain (<code className="font-mono text-xs">{domain}</code>) or one of its
            subdomains. Change the domain in Settings below to the one your site is served from. It can take up to a
            minute to apply.
          </p>
        </div>
      )}

      {lastEventAt ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-good-ink">
            <span className="size-2 rounded-full bg-good" aria-hidden />
            Receiving data
          </span>
          <span className="text-ink-2">
            Last measurement <LocalTime value={lastEventAt} />
            {lastPath && (
              <>
                {' '}on <code className="font-mono text-xs">{lastPath}</code>
              </>
            )}
            .
          </span>
          <Link href={`/dashboard/${siteId}`} className="font-medium text-accent-ink hover:underline">
            View overview
          </Link>
        </div>
      ) : (
        <div className="text-sm">
          <p className="inline-flex items-center gap-2 font-medium">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
            Waiting for the first measurement…
          </p>
          <p className="mt-1 text-ink-2">
            Once the tag is live, open any page of your site in a normal browser. Data arrives about 5 seconds later
            and this page updates by itself.
          </p>
        </div>
      )}

      {(!lastEventAt || rejected) && <AutoRefresh />}
    </div>
  );
}

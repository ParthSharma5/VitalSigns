'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteTabs({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/dashboard/${siteId}`, label: 'Overview' },
    { href: `/dashboard/${siteId}/visits`, label: 'Visits' },
    { href: `/dashboard/${siteId}/settings`, label: 'Install & settings' },
  ];
  return (
    <nav className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
      {tabs.map((t) => {
        const active = t.href.endsWith(siteId) ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 ${active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

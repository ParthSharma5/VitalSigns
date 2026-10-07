import Link from 'next/link';
import type { DeviceFilter, RangeKey } from '@/lib/queries';

export const RANGE_LABEL: Record<RangeKey, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' };
export const DEVICES: DeviceFilter[] = ['all', 'mobile', 'desktop', 'tablet'];
export const DEVICE_LABEL: Record<DeviceFilter, string> = { all: 'All devices', mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' };

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function countryName(code: string | null): string {
  if (!code || code === '??') return 'Unknown';
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function FilterGroup({ label, options }: { label: string; options: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <nav aria-label={label} className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.active ? 'true' : undefined}
          className={`rounded-md px-2.5 py-1 ${o.active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

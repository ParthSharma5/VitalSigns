import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { RATING_LABEL, formatValue, rate, type MetricName, type Rating } from '@/lib/metrics';

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M5 17.5h4.5l2.8-7 4.6 12 3.3-8 2 2.6H27"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className = '', href = '/' }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="VitalSigns home"
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}
    >
      <LogoMark />
      VitalSigns
    </Link>
  );
}

export function Card({ title, subtitle, action, children, className = '' }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const RATING_STYLE: Record<Rating, { dot: string; icon: string }> = {
  good: { dot: 'bg-good', icon: '✓' },
  'needs-improvement': { dot: 'bg-warn', icon: '!' },
  poor: { dot: 'bg-poor', icon: '✕' },
};

export function RatingBadge({ rating, compact = false }: { rating: Rating; compact?: boolean }) {
  const s = RATING_STYLE[rating];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span
        className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ${s.dot}`}
        aria-hidden="true"
      >
        {s.icon}
      </span>
      {compact ? <span className="sr-only">{RATING_LABEL[rating]}</span> : RATING_LABEL[rating]}
    </span>
  );
}

export function FewViews() {
  return (
    <span
      className="mr-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn-ink"
      title="Only a few views so far: these numbers will settle as more visitors arrive."
    >
      few visits
    </span>
  );
}

export function MetricCell({ metric, value }: { metric: MetricName; value: number | null }) {
  if (value == null) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5 tabular">
      <RatingBadge rating={rate(metric, value)} compact />
      {formatValue(metric, value)}
    </span>
  );
}

export function Button({ variant = 'primary', className = '', ...props }: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = {
    primary: 'bg-accent text-white hover:opacity-90',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
    danger: 'border border-poor/40 text-poor-ink hover:bg-poor/10',
  }[variant];
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-accent';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <p role="alert" className="text-sm text-poor-ink">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm text-good-ink">{state.ok}</p>;
  return null;
}

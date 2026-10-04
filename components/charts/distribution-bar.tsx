import { RATING_LABEL, type Rating } from '@/lib/metrics';
import { RatingBadge } from '@/components/ui';

const FILL: Record<Rating, string> = { good: 'bg-good', 'needs-improvement': 'bg-warn', poor: 'bg-poor' };

// Share of visits rated good / needs work / poor. Segments are separated by a
// 2px surface gap; values live in the legend, so nothing depends on hover.
export function DistributionBar({ good, needsImprovement, poor }: { good: number; needsImprovement: number; poor: number }) {
  const total = good + needsImprovement + poor;
  if (total === 0) return <p className="text-xs text-muted">No samples yet.</p>;
  const parts: Array<[Rating, number]> = [
    ['good', good],
    ['needs-improvement', needsImprovement],
    ['poor', poor],
  ];
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map(([r, n]) => `${RATING_LABEL[r]} ${pct(n)}%`).join(', ')}>
        {parts.map(([rating, n]) =>
          n > 0 ? (
            <div
              key={rating}
              className={`${FILL[rating]} h-full first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(n / total) * 100}%` }}
              title={`${RATING_LABEL[rating]}: ${pct(n)}% (${n.toLocaleString()})`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map(([rating, n]) => (
          <li key={rating} className="inline-flex items-center gap-1 text-xs">
            <RatingBadge rating={rating} compact />
            <span className="font-medium text-ink tabular">{pct(n)}%</span>
            <span className="text-muted">{RATING_LABEL[rating].toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

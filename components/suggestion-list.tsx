import { FewViews, RatingBadge } from '@/components/ui';
import { FEW_VIEWS, type PageDiagnostics } from '@/lib/queries';
import type { Suggestion } from '@/lib/suggestions';

export type PageSuggestions = { page: PageDiagnostics; items: Suggestion[] };

export function SuggestionList({ suggestions, empty }: { suggestions: PageSuggestions[]; empty: string }) {
  if (suggestions.length === 0) return <p className="text-sm text-ink-2">{empty}</p>;
  return (
    <div className="space-y-6">
      {suggestions.map(({ page, items }) => (
        <div key={page.path}>
          <h3 className="font-mono text-xs font-medium text-ink">
            {page.path}
            <span className="ml-2 font-sans font-normal text-muted">{page.views.toLocaleString()} views</span>
            {page.views < FEW_VIEWS && <span className="ml-2 font-sans"><FewViews /></span>}
          </h3>
          <ul className="mt-2 space-y-2">
            {items.map((s) => (
              <li key={`${s.metric}-${s.title}`} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingBadge rating={s.severity} compact />
                  <span className="text-xs font-semibold text-muted">{s.metric}</span>
                  <span className="text-sm font-medium">{s.title}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">{s.detail}</p>
                <p className="mt-1 text-xs text-muted">Based on: {s.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

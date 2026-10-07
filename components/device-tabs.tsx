'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type DeviceTab = { key: string; label: string; count: number; content: ReactNode };

export function DeviceTabs({ tabs, defaultKey }: { tabs: DeviceTab[]; defaultKey: string }) {
  const [active, setActive] = useState(defaultKey);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    setActive(tabs[next].key);
    buttons.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Device" className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
        {tabs.map((t, i) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 ${
                selected ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {t.label}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular ${
                  t.count > 0 ? 'bg-poor/15 text-poor-ink' : 'bg-surface-2 text-muted'
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${baseId}-panel-${t.key}`}
          aria-labelledby={`${baseId}-tab-${t.key}`}
          hidden={t.key !== active}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

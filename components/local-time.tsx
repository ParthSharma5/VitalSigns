'use client';

import { useSyncExternalStore } from 'react';

const FORMATS = {
  datetime: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  full: { dateStyle: 'medium', timeStyle: 'short' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const subscribe = () => () => {};

export function LocalTime({ value, format = 'datetime', className = '' }: {
  value: string | Date;
  format?: keyof typeof FORMATS;
  className?: string;
}) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = isClient ? FORMATS[format] : { ...FORMATS[format], timeZone: 'UTC' };
  return (
    <time
      dateTime={date.toISOString()}
      title={isClient ? date.toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' }) : undefined}
      className={`${isClient ? '' : 'invisible'} ${className}`}
    >
      {date.toLocaleString('en', options)}
    </time>
  );
}

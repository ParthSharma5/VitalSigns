'use client';

import { useState } from 'react';

export function CopySnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-lg border border-line bg-surface-2">
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-[13px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

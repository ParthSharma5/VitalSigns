'use client';

import { useRef, useState } from 'react';

// navigator.clipboard needs a secure context and permission; fall back to the legacy copy command.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

export function CopySnippet({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const codeRef = useRef<HTMLElement>(null);
  return (
    <div className="relative rounded-lg border border-line bg-surface-2">
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-[13px] leading-relaxed text-ink">
        <code ref={codeRef}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={async () => {
          const ok = await copyText(code);
          if (!ok && codeRef.current) {
            // Select the tag so the user can copy it by hand.
            const range = document.createRange();
            range.selectNodeContents(codeRef.current);
            const selection = getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
          setState(ok ? 'copied' : 'failed');
          setTimeout(() => setState('idle'), ok ? 1500 : 4000);
        }}
        className="absolute right-2 top-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2"
      >
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : 'Copy'}
      </button>
    </div>
  );
}

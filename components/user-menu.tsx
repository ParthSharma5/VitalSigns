'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { logout } from '@/app/actions';

export function UserMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass = 'block w-full rounded-md px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
        className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-white outline-offset-2 hover:opacity-90"
      >
        {email[0]}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-10 z-50 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate text-sm font-medium text-ink">{email}</p>
          </div>
          <div className="py-1">
            <Link href="/dashboard" className={itemClass}>Your sites</Link>
            {isAdmin && <Link href="/admin" className={itemClass}>Admin</Link>}
          </div>
          <form action={logout} className="border-t border-line pt-1">
            <button type="submit" className={itemClass}>Log out</button>
          </form>
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks, type NavItem } from '@/components/nav-links';
import { Logo } from '@/components/ui';
import { UserMenu } from '@/components/user-menu';
import { isAdminEmail } from '@/lib/admin';
import type { User } from '@/lib/auth';

function HeaderShell({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/80 backdrop-blur supports-[backdrop-filter]:bg-page/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">{children}</div>
    </header>
  );
}

const MARKETING_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
];

export function MarketingHeader({ user }: { user: User | null }) {
  return (
    <HeaderShell>
      <Logo />
      <nav aria-label="Main" className="ml-6 hidden items-center gap-1 text-sm md:flex">
        {MARKETING_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            {l.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 text-sm">
        {user ? (
          <Link href="/dashboard" className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white hover:opacity-90">
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white hover:opacity-90">
              Get started
            </Link>
          </>
        )}
      </div>
    </HeaderShell>
  );
}

export function AppHeader({ user }: { user: User }) {
  const isAdmin = isAdminEmail(user.email);
  const items: NavItem[] = [{ href: '/dashboard', label: 'Sites' }];
  if (isAdmin) items.push({ href: '/admin', label: 'Admin' });

  return (
    <HeaderShell>
      <Logo href="/dashboard" />
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <NavLinks items={items} />
      <div className="ml-auto">
        <UserMenu email={user.email} isAdmin={isAdmin} />
      </div>
    </HeaderShell>
  );
}

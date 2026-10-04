import { logout } from '@/app/actions';
import Link from 'next/link';
import { Logo } from '@/components/ui';
import { isAdminEmail } from '@/lib/admin';
import { requireUser } from '@/lib/auth';

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-4 text-sm">
            {isAdminEmail(user.email) && (
              <Link href="/admin" className="font-medium text-poor-ink hover:underline">Admin</Link>
            )}
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <form action={logout}>
              <button className="text-ink-2 hover:text-ink">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

import { Logo } from '@/components/ui';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-8 text-lg" />
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">{children}</div>
    </main>
  );
}

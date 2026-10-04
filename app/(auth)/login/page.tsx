import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage(props: PageProps<'/login'>) {
  if (await getUser()) redirect('/dashboard');
  const { next } = await props.searchParams;
  return (
    <>
      <h1 className="mb-5 text-lg font-semibold">Log in</h1>
      <AuthForm mode="login" next={typeof next === 'string' ? next : undefined} />
    </>
  );
}

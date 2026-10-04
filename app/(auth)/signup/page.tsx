import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage() {
  if (await getUser()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mb-5 mt-1 text-sm text-ink-2">Free. You will get your script tag on the next screen.</p>
      <AuthForm mode="signup" />
    </>
  );
}

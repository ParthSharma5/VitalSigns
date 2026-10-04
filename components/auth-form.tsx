'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, signup } from '@/app/actions';
import { Button, Field, FormMessage, inputClass } from '@/components/ui';

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const [state, action, pending] = useActionState(mode === 'login' ? login : signup, undefined);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
        <input
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={8}
          required
          className={inputClass}
        />
      </Field>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-ink-2">
        {mode === 'login' ? (
          <>No account? <Link href="/signup" className="font-medium text-accent-ink hover:underline">Sign up free</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-accent-ink hover:underline">Log in</Link></>
        )}
      </p>
    </form>
  );
}

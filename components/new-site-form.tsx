'use client';

import { useActionState } from 'react';
import { createSite } from '@/app/actions';
import { Button, Field, FormMessage, inputClass } from '@/components/ui';

export function NewSiteForm() {
  const [state, action, pending] = useActionState(createSite, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Domain">
        <input name="domain" placeholder="example.com" required className={inputClass} />
      </Field>
      <Field label="Name (optional)">
        <input name="name" placeholder="Marketing site" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add site'}</Button>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

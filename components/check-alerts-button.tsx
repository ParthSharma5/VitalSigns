'use client';

import { useActionState } from 'react';
import { checkAlertsNow } from '@/app/actions';
import { Button, FormMessage } from '@/components/ui';

export function CheckAlertsButton({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(checkAlertsNow.bind(null, siteId), undefined);
  return (
    <form action={action} className="flex items-center gap-3">
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="h-8 px-3 text-xs">
        {pending ? 'Checking…' : 'Check now'}
      </Button>
    </form>
  );
}

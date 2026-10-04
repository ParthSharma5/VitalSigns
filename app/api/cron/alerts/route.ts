import { runAlertCheck } from '@/lib/alerts';

// Called hourly by a scheduler (vercel.json cron, GitHub Actions, crontab...).
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runAlertCheck();
  return Response.json({ checked: result.checked, created: result.created.length });
}

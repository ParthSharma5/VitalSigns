import { sql } from '@/lib/db';
import { getWriter } from '@/lib/events';

export async function GET() {
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    return Response.json({ ok: false, db: 'not_configured', hint: 'Set DATABASE_URL and redeploy.' }, { status: 503 });
  }
  try {
    await sql('SELECT 1');
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err instanceof Error ? err.name : 'unknown');
    console.error('[health] database check failed', err);
    return Response.json({ ok: false, db: 'unreachable', code }, { status: 503 });
  }
  return Response.json({ ok: true, ingest: getWriter().stats });
}

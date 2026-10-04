import { sql } from '@/lib/db';
import { getWriter } from '@/lib/events';

export async function GET() {
  try {
    await sql('SELECT 1');
  } catch {
    return Response.json({ ok: false, db: 'unreachable' }, { status: 503 });
  }
  return Response.json({ ok: true, ingest: getWriter().stats });
}

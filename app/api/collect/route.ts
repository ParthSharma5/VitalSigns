import { after } from 'next/server';
import { getWriter, lookupSite } from '@/lib/events';
import { classifyDevice, countryFromHeaders, isBot, originAllowed, parseBeacon, toRows } from '@/lib/ingest';

const CORS = { 'Access-Control-Allow-Origin': '*' };
const reply = (status: number) => new Response(null, { status, headers: CORS });

export async function POST(request: Request) {
  const beacon = parseBeacon(await request.text());
  if (!beacon) return reply(400);

  const ua = request.headers.get('user-agent') ?? '';
  if (isBot(ua)) return reply(204);

  const site = await lookupSite(beacon.s);
  if (!site) return reply(404);
  if (!originAllowed(request.headers.get('origin'), site.domain)) return reply(403);

  const rows = toRows(beacon, { device: classifyDevice(ua), country: countryFromHeaders(request.headers) }).map(
    (row) => ({ ...row, siteId: site.id }),
  );

  const written = getWriter().enqueue(rows);
  if (!written) return reply(503);

  after(() => written.catch((err) => console.error('[collect] batch write failed', err)));
  return reply(202);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sql } from './db';
import { SESSION_COOKIE } from './session-cookie';

export { SESSION_COOKIE };
export { hashPassword, verifyPassword } from './password';
const SESSION_DAYS = 30;

const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [tokenId(token), userId, expires]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql('DELETE FROM sessions WHERE id = $1', [tokenId(token)]);
  jar.delete(SESSION_COOKIE);
}

export type User = { id: string; email: string };

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [user] = await sql<User>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [tokenId(token)],
  );
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

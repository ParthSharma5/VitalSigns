import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminEmail } from '../lib/admin';

describe('isAdminEmail', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('matches listed emails case-insensitively', () => {
    vi.stubEnv('ADMIN_EMAILS', 'Owner@Example.com, second@example.com');
    expect(isAdminEmail('owner@example.com')).toBe(true);
    expect(isAdminEmail('SECOND@example.com')).toBe(true);
    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('allows nobody when unset or empty', () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(isAdminEmail('owner@example.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });
});

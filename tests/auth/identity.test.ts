import { describe, expect, it } from 'vitest';
import {
  isEmailIdentifier,
  normalizeEmail,
  normalizeLoginIdentifier,
  normalizeUsername,
  validateUsername,
} from '@/lib/auth/identity';

describe('auth identity helpers', () => {
  it('normalizes email, username, and login identifier consistently', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(normalizeUsername(' Alice_01 ')).toBe('alice_01');
    expect(normalizeLoginIdentifier(' Bob@example.COM ')).toBe('bob@example.com');
  });

  it('distinguishes email identifiers from usernames', () => {
    expect(isEmailIdentifier('user@example.com')).toBe(true);
    expect(isEmailIdentifier('alice_01')).toBe(false);
  });

  it('accepts safe usernames and rejects ambiguous or invalid ones', () => {
    expect(validateUsername('alice_01')).toBeNull();
    expect(validateUsername('a.b-123')).toBeNull();
    expect(validateUsername('ab')).toMatch('3-32');
    expect(validateUsername('_alice')).toMatch('3-32');
    expect(validateUsername('alice@example.com')).toBe('用户名不能包含 @');
  });
});

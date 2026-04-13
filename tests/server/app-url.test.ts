import { describe, it, expect, afterEach } from 'vitest';
import { getAppOrigin, getAppBaseUrl, buildAppUrl } from '@/lib/server/app-url';

function fakeUrl(href: string): URL {
  return new URL(href);
}

function fakeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('getAppOrigin', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses APP_PUBLIC_ORIGIN when set', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://sys.example.com/maic';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(getAppOrigin()).toBe('https://sys.example.com');
  });

  it('falls back to AUTH_URL when APP_PUBLIC_ORIGIN is empty', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = 'https://auth.example.com/maic';
    process.env.NEXTAUTH_URL = '';
    expect(getAppOrigin()).toBe('https://auth.example.com');
  });

  it('falls back to NEXTAUTH_URL when others are empty', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = 'https://next.example.com';
    expect(getAppOrigin()).toBe('https://next.example.com');
  });

  it('uses x-forwarded-host header when no config', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    const headers = fakeHeaders({
      'x-forwarded-host': 'proxy.example.com',
      'x-forwarded-proto': 'https',
    });
    expect(getAppOrigin(undefined, headers)).toBe('https://proxy.example.com');
  });

  it('falls back to requestUrl.origin as last resort', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(getAppOrigin(fakeUrl('http://localhost:3000/some/path'))).toBe(
      'http://localhost:3000',
    );
  });

  it('returns localhost default when nothing available', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(getAppOrigin()).toBe('http://localhost:3000');
  });

  it('config takes priority over headers and requestUrl', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://configured.example.com';
    const headers = fakeHeaders({
      'x-forwarded-host': 'proxy.example.com',
      'x-forwarded-proto': 'https',
    });
    const url = fakeUrl('http://localhost:9999/foo');
    expect(getAppOrigin(url, headers)).toBe('https://configured.example.com');
  });

  it('ignores invalid config URLs gracefully', () => {
    process.env.APP_PUBLIC_ORIGIN = 'not-a-valid-url';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(getAppOrigin(fakeUrl('http://localhost:3000/'))).toBe(
      'http://localhost:3000',
    );
  });
});

describe('getAppBaseUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns origin alone when no basePath', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_PATH = '';
    expect(getAppBaseUrl()).toBe('https://example.com');
  });
});

describe('buildAppUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds absolute URL for app-internal path', () => {
    process.env.APP_PUBLIC_ORIGIN = 'https://example.com';
    const url = buildAppUrl('/login');
    expect(url.href).toMatch(/^https:\/\/example\.com/);
    expect(url.pathname).toContain('login');
  });

  it('builds correct URL with request fallback', () => {
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    const url = buildAppUrl('/classroom/abc', fakeUrl('http://myhost:8080/'));
    expect(url.origin).toBe('http://myhost:8080');
    expect(url.pathname).toContain('classroom/abc');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { checkAppEntryEnv, runAppEntryEnvCheck } from '@/lib/server/env-check';
import type { DiagnosticMessage } from '@/lib/server/env-check';

function makeEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NEXT_PUBLIC_BASE_PATH: '',
    APP_PUBLIC_ORIGIN: '',
    AUTH_URL: '',
    NEXTAUTH_URL: '',
    NODE_ENV: 'development',
    ...overrides,
  };
}

function errors(d: DiagnosticMessage[]): DiagnosticMessage[] {
  return d.filter((m) => m.level === 'error');
}

function warnings(d: DiagnosticMessage[]): DiagnosticMessage[] {
  return d.filter((m) => m.level === 'warn');
}

// ---------------------------------------------------------------------------
// 正常配置 — 不应有任何 error 或 warn
// ---------------------------------------------------------------------------

describe('正常配置', () => {
  it('最小本地开发配置：全部留空', () => {
    const d = checkAppEntryEnv(makeEnv());
    expect(d).toHaveLength(0);
  });

  it('典型子路径部署', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        NEXT_PUBLIC_BASE_PATH: '/maic',
        APP_PUBLIC_ORIGIN: 'https://dev.example.com',
      }),
    );
    expect(errors(d)).toHaveLength(0);
    expect(warnings(d)).toHaveLength(0);
  });

  it('生产环境 + 完整 origin', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        NEXT_PUBLIC_BASE_PATH: '/maic',
        APP_PUBLIC_ORIGIN: 'https://sys.example.com',
        NODE_ENV: 'production',
      }),
    );
    expect(errors(d)).toHaveLength(0);
    expect(warnings(d)).toHaveLength(0);
  });

  it('根路径部署（无 basePath）', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'https://example.com',
      }),
    );
    expect(d).toHaveLength(0);
  });

  it('localhost HTTP 在开发环境下不产生警告', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'http://localhost:3000',
      }),
    );
    expect(d).toHaveLength(0);
  });

  it('basePath 不带前导斜杠也正常', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        NEXT_PUBLIC_BASE_PATH: 'maic',
        APP_PUBLIC_ORIGIN: 'https://example.com',
      }),
    );
    expect(errors(d)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// basePath 错误配置 — 应触发 error
// ---------------------------------------------------------------------------

describe('basePath 错误', () => {
  it('basePath 包含协议', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: 'https://example.com/maic' }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].variable).toBe('NEXT_PUBLIC_BASE_PATH');
    expect(errors(d)[0].message).toContain('://');
  });

  it('basePath 包含查询参数', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: '/maic?debug=1' }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].message).toContain('?');
  });

  it('basePath 包含锚点', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: '/maic#section' }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
  });

  it('basePath 包含空格', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: '/my app' }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].message).toContain('空白');
  });
});

// ---------------------------------------------------------------------------
// basePath 警告 — 不致命但需注意
// ---------------------------------------------------------------------------

describe('basePath 警告', () => {
  it('basePath 带尾部斜杠', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: '/maic/' }),
    );
    expect(errors(d)).toHaveLength(0);
    expect(warnings(d).length).toBeGreaterThanOrEqual(1);
    expect(warnings(d)[0].message).toContain('尾部斜杠');
  });

  it('basePath 包含连续斜杠', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NEXT_PUBLIC_BASE_PATH: '/maic//app' }),
    );
    expect(errors(d)).toHaveLength(0);
    expect(warnings(d).length).toBeGreaterThanOrEqual(1);
    expect(warnings(d)[0].message).toContain('连续斜杠');
  });
});

// ---------------------------------------------------------------------------
// Origin 变量错误 — 应触发 error
// ---------------------------------------------------------------------------

describe('origin 变量错误', () => {
  it('APP_PUBLIC_ORIGIN 不是合法 URL', () => {
    const d = checkAppEntryEnv(
      makeEnv({ APP_PUBLIC_ORIGIN: 'not-a-url' }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].variable).toBe('APP_PUBLIC_ORIGIN');
    expect(errors(d)[0].message).toContain('不是合法 URL');
  });

  it('AUTH_URL 不是合法 URL', () => {
    const d = checkAppEntryEnv(makeEnv({ AUTH_URL: '://bad' }));
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].variable).toBe('AUTH_URL');
  });

  it('NEXTAUTH_URL 不是合法 URL', () => {
    const d = checkAppEntryEnv(makeEnv({ NEXTAUTH_URL: 'ftp://' }));
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].variable).toBe('NEXTAUTH_URL');
  });

  it('APP_PUBLIC_ORIGIN 路径与 basePath 重复', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'https://dev.example.com/maic',
        NEXT_PUBLIC_BASE_PATH: '/maic',
      }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].message).toContain('重复');
  });

  it('AUTH_URL 路径以 basePath 开头', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        AUTH_URL: 'https://dev.example.com/maic/extra',
        NEXT_PUBLIC_BASE_PATH: '/maic',
      }),
    );
    expect(errors(d).length).toBeGreaterThanOrEqual(1);
    expect(errors(d)[0].message).toContain('basePath');
  });
});

// ---------------------------------------------------------------------------
// Origin 变量警告
// ---------------------------------------------------------------------------

describe('origin 变量警告', () => {
  it('origin 包含非根路径（非 basePath 重复）', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'https://example.com/some/path',
      }),
    );
    expect(errors(d)).toHaveLength(0);
    expect(warnings(d).length).toBeGreaterThanOrEqual(1);
    expect(warnings(d)[0].message).toContain('非根路径');
  });

  it('多个 origin 变量不一致', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'https://a.example.com',
        AUTH_URL: 'https://b.example.com',
      }),
    );
    expect(warnings(d).some((w) => w.message.includes('不同的域'))).toBe(true);
  });

  it('生产环境使用 HTTP（非 localhost）', () => {
    const d = checkAppEntryEnv(
      makeEnv({
        APP_PUBLIC_ORIGIN: 'http://prod.example.com',
        NODE_ENV: 'production',
      }),
    );
    expect(warnings(d).some((w) => w.message.includes('http://'))).toBe(true);
  });

  it('生产环境无 origin 配置', () => {
    const d = checkAppEntryEnv(
      makeEnv({ NODE_ENV: 'production' }),
    );
    expect(warnings(d).some((w) => w.message.includes('未配置任何 origin'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// runAppEntryEnvCheck — fail-fast 行为
// ---------------------------------------------------------------------------

describe('runAppEntryEnvCheck', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('正常配置不抛异常', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/maic';
    process.env.APP_PUBLIC_ORIGIN = 'https://example.com';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(() => runAppEntryEnvCheck()).not.toThrow();
  });

  it('致命错误时抛异常（fail-fast）', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = 'https://example.com/maic';
    process.env.APP_PUBLIC_ORIGIN = '';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(() => runAppEntryEnvCheck()).toThrow(/致命配置错误/);
  });

  it('仅有警告时不抛异常', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/maic/';
    process.env.APP_PUBLIC_ORIGIN = 'https://example.com';
    process.env.AUTH_URL = '';
    process.env.NEXTAUTH_URL = '';
    expect(() => runAppEntryEnvCheck()).not.toThrow();
  });
});

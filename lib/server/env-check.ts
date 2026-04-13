/**
 * 启动期环境兼容自检 — 应用入口相关配置
 *
 * 目标：
 *   1. 尽早发现会导致多环境漂移的错误配置
 *   2. 对明显错误的配置做 fail-fast
 *   3. 对可疑但可容忍的配置给出明确警告
 *   4. 不写死域名、不做 host 特判
 *
 * 接入点：instrumentation.ts（Next.js 启动期钩子）
 */

const LOG_PREFIX = '[env-check]';

export interface DiagnosticMessage {
  level: 'error' | 'warn';
  variable: string;
  message: string;
  value?: string;
  expected?: string;
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function isLocalhostHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

// ---------------------------------------------------------------------------
// 核心检查逻辑 — 纯函数，方便测试
// ---------------------------------------------------------------------------

export function checkAppEntryEnv(
  env: Record<string, string | undefined> = process.env,
): DiagnosticMessage[] {
  const diagnostics: DiagnosticMessage[] = [];

  const rawBasePath = (env.NEXT_PUBLIC_BASE_PATH ?? '').trim();
  const appOrigin = (env.APP_PUBLIC_ORIGIN ?? '').trim();
  const authUrl = (env.AUTH_URL ?? '').trim();
  const nextAuthUrl = (env.NEXTAUTH_URL ?? '').trim();
  const nodeEnv = (env.NODE_ENV ?? '').trim();

  const normalizedBasePath =
    rawBasePath && rawBasePath !== '/'
      ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
      : '';

  // ── NEXT_PUBLIC_BASE_PATH ──

  if (rawBasePath) {
    if (rawBasePath.includes('://')) {
      diagnostics.push({
        level: 'error',
        variable: 'NEXT_PUBLIC_BASE_PATH',
        message:
          '包含协议前缀 "://"，这应该是一个纯路径而不是完整 URL',
        value: rawBasePath,
        expected: '纯路径，如 /maic 或 maic',
      });
    }

    if (rawBasePath.includes('?') || rawBasePath.includes('#')) {
      diagnostics.push({
        level: 'error',
        variable: 'NEXT_PUBLIC_BASE_PATH',
        message: '包含查询参数 "?" 或锚点 "#"，basePath 不允许这些字符',
        value: rawBasePath,
        expected: '纯路径，如 /maic',
      });
    }

    if (/\s/.test(rawBasePath)) {
      diagnostics.push({
        level: 'error',
        variable: 'NEXT_PUBLIC_BASE_PATH',
        message: '路径中包含空白字符',
        value: JSON.stringify(rawBasePath),
        expected: '不含空格的路径，如 /maic',
      });
    }

    if (rawBasePath !== '/' && rawBasePath.endsWith('/')) {
      diagnostics.push({
        level: 'warn',
        variable: 'NEXT_PUBLIC_BASE_PATH',
        message: '带有尾部斜杠，运行时已自动去除但建议直接修正',
        value: rawBasePath,
        expected: normalizedBasePath,
      });
    }

    if (/\/\//.test(rawBasePath.replace(/^\//, ''))) {
      diagnostics.push({
        level: 'warn',
        variable: 'NEXT_PUBLIC_BASE_PATH',
        message: '包含连续斜杠，运行时已自动归一化但建议直接修正',
        value: rawBasePath,
        expected: normalizedBasePath,
      });
    }
  }

  // ── Origin 类变量（APP_PUBLIC_ORIGIN / AUTH_URL / NEXTAUTH_URL）──

  const originVars: { name: string; value: string }[] = [
    { name: 'APP_PUBLIC_ORIGIN', value: appOrigin },
    { name: 'AUTH_URL', value: authUrl },
    { name: 'NEXTAUTH_URL', value: nextAuthUrl },
  ];

  const parsedOrigins = new Map<string, string>();

  for (const { name, value } of originVars) {
    if (!value) continue;

    if (!isValidUrl(value)) {
      diagnostics.push({
        level: 'error',
        variable: name,
        message: '不是合法 URL，无法解析',
        value,
        expected: '完整 URL，如 https://example.com',
      });
      continue;
    }

    const parsed = new URL(value);
    parsedOrigins.set(name, parsed.origin);
    const pathname = parsed.pathname;

    if (pathname !== '/' && pathname !== '') {
      if (normalizedBasePath && pathname === normalizedBasePath) {
        diagnostics.push({
          level: 'error',
          variable: name,
          message:
            `URL 路径 "${pathname}" 与 NEXT_PUBLIC_BASE_PATH 完全重复。` +
            `代码只使用 origin 部分（${parsed.origin}），basePath 由 NEXT_PUBLIC_BASE_PATH 单独控制。` +
            `两者同时携带相同路径不会导致重复拼接，但说明配置有误`,
          value,
          expected: parsed.origin,
        });
      } else if (
        normalizedBasePath &&
        pathname.startsWith(normalizedBasePath + '/')
      ) {
        diagnostics.push({
          level: 'error',
          variable: name,
          message:
            `URL 路径 "${pathname}" 以 NEXT_PUBLIC_BASE_PATH "${normalizedBasePath}" 开头。` +
            `origin 类变量应只包含 scheme+host，basePath 由 NEXT_PUBLIC_BASE_PATH 单独控制`,
          value,
          expected: parsed.origin,
        });
      } else {
        diagnostics.push({
          level: 'warn',
          variable: name,
          message:
            `包含非根路径 "${pathname}"，代码中仅使用 origin 部分（${parsed.origin}），该路径会被忽略`,
          value,
          expected: `${parsed.origin}（仅 scheme+host）`,
        });
      }
    }

    if (
      parsed.protocol === 'http:' &&
      !isLocalhostHost(parsed.hostname) &&
      nodeEnv === 'production'
    ) {
      diagnostics.push({
        level: 'warn',
        variable: name,
        message: '生产环境使用 http:// 而非 https://，请确认这是预期行为',
        value,
        expected: value.replace(/^http:/, 'https:'),
      });
    }
  }

  // ── 跨变量一致性 ──

  const distinctOrigins = new Set(parsedOrigins.values());
  if (distinctOrigins.size > 1) {
    const details = [...parsedOrigins.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    diagnostics.push({
      level: 'warn',
      variable: 'APP_PUBLIC_ORIGIN / AUTH_URL / NEXTAUTH_URL',
      message: `多个 origin 变量解析出不同的域，可能导致认证回跳与页面访问不一致：${details}`,
    });
  }

  // ── 生产环境额外检查 ──

  if (nodeEnv === 'production') {
    if (!appOrigin && !authUrl && !nextAuthUrl) {
      diagnostics.push({
        level: 'warn',
        variable: 'APP_PUBLIC_ORIGIN',
        message:
          '生产环境下未配置任何 origin 变量，' +
          '应用将通过请求头推断 origin，在反向代理未正确传递 x-forwarded-host 时可能导致回跳错误',
        expected: '设置 APP_PUBLIC_ORIGIN=https://your-domain.com',
      });
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// 执行入口 — 带日志输出和 fail-fast
// ---------------------------------------------------------------------------

function formatDiagnostic(d: DiagnosticMessage): string {
  const icon = d.level === 'error' ? '✖' : '⚠';
  const lines = [`${LOG_PREFIX} ${icon} [${d.variable}] ${d.message}`];
  if (d.value !== undefined) lines.push(`  当前值: ${d.value}`);
  if (d.expected !== undefined) lines.push(`  期望:   ${d.expected}`);
  return lines.join('\n');
}

/**
 * 执行启动期环境自检。
 *
 * - error 级别 → 输出后 throw（fail-fast）
 * - warn  级别 → 输出日志，不阻塞启动
 * - 全部通过    → 静默
 */
export function runAppEntryEnvCheck(): void {
  const diagnostics = checkAppEntryEnv();

  if (diagnostics.length === 0) return;

  const errors = diagnostics.filter((d) => d.level === 'error');
  const warnings = diagnostics.filter((d) => d.level === 'warn');

  for (const w of warnings) {
    console.warn(formatDiagnostic(w));
  }

  for (const e of errors) {
    console.error(formatDiagnostic(e));
  }

  if (errors.length > 0) {
    throw new Error(
      `${LOG_PREFIX} 发现 ${errors.length} 个致命配置错误，请修正后重新启动。`,
    );
  }
}

import { existsSync, readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

const shellDefinedEnv = new Set(Object.keys(process.env));

function loadEnvFile(path: string, allowOverrideFromFile = false) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (!allowOverrideFromFile && process.env[key] !== undefined) {
      continue;
    }
    if (allowOverrideFromFile && shellDefinedEnv.has(key)) {
      continue;
    }

    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local', true);

const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();
const basePath =
  rawBasePath && rawBasePath !== '/'
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
    : '';
const trailingSlash = ['1', 'true', 'yes', 'on'].includes(
  (process.env.NEXT_TRAILING_SLASH || '').trim().toLowerCase(),
);

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  trailingSlash,
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;

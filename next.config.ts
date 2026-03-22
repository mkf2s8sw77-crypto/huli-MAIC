import type { NextConfig } from 'next';

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

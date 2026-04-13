const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();

export const BASE_PATH =
  rawBasePath && rawBasePath !== '/'
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
    : '';

function maybeRewritePublicAsset(path: string): string {
  if (
    path === '/huli-tech-logo.png' ||
    path.startsWith('/avatars/') ||
    path.startsWith('/logos/')
  ) {
    return `/api/public-assets${path}`;
  }

  return path;
}

export function stripBasePath(path: string): string {
  if (!path || !BASE_PATH) {
    return path;
  }

  if (path === BASE_PATH) {
    return '/';
  }

  if (path.startsWith(`${BASE_PATH}/`)) {
    return path.slice(BASE_PATH.length) || '/';
  }

  return path;
}

export function withBasePath(path: string): string {
  if (!path || !BASE_PATH || !path.startsWith('/')) {
    return path?.startsWith('/') ? maybeRewritePublicAsset(path) : path;
  }

  const rewritten = maybeRewritePublicAsset(path);

  if (
    rewritten.startsWith('//') ||
    rewritten === BASE_PATH ||
    rewritten.startsWith(`${BASE_PATH}/`)
  ) {
    return rewritten;
  }

  return `${BASE_PATH}${rewritten}`;
}

const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();

export const BASE_PATH =
  rawBasePath && rawBasePath !== '/'
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
    : '';

export function withBasePath(path: string): string {
  if (!path || !BASE_PATH || !path.startsWith('/')) {
    return path;
  }

  if (path.startsWith('//') || path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) {
    return path;
  }

  return `${BASE_PATH}${path}`;
}

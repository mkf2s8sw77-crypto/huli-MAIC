/**
 * Explicit helpers for building URLs to public static assets.
 *
 * Assets under `/avatars/` and `/logos/` are served by dedicated Next.js route
 * handlers (`app/avatars/[...path]`, `app/logos/[...path]`), so they only need
 * basePath prepended.
 *
 * Other root-level public assets (e.g. `/huli-tech-logo.png`) are routed
 * through the catch-all `/api/public-assets/` handler to guarantee
 * accessibility under both root and sub-path deployments.
 */

import { BASE_PATH } from './base-path';

function prefixBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path.startsWith(`${BASE_PATH}/`) || path === BASE_PATH) return path;
  return `${BASE_PATH}${path}`;
}

/**
 * Build a fully-qualified URL for any public asset.
 *
 * - `/avatars/*` and `/logos/*` → basePath + original path (route handler)
 * - everything else → basePath + `/api/public-assets` + original path
 */
export function publicAssetUrl(assetPath: string): string {
  if (!assetPath || !assetPath.startsWith('/')) return assetPath;

  if (assetPath.startsWith('/avatars/') || assetPath.startsWith('/logos/')) {
    return prefixBasePath(assetPath);
  }

  return prefixBasePath(`/api/public-assets${assetPath}`);
}

/** URL for the app logo image. */
export function appLogoUrl(): string {
  return publicAssetUrl('/huli-tech-logo.png');
}

/**
 * Build URL for an avatar image stored under `public/avatars/`.
 *
 * Accepts either a bare filename (`teacher.png`) or a full path
 * (`/avatars/teacher.png`). The caller does NOT need to remember
 * any implicit rewriting rule.
 */
export function avatarAssetUrl(nameOrPath: string): string {
  if (!nameOrPath) return nameOrPath;
  const normalized = nameOrPath.startsWith('/avatars/')
    ? nameOrPath
    : `/avatars/${nameOrPath.replace(/^\/+/, '')}`;
  return publicAssetUrl(normalized);
}

/**
 * Build URL for a provider / brand logo under `public/logos/`.
 *
 * Accepts either a bare filename (`openai.svg`) or a full path
 * (`/logos/openai.svg`).
 */
export function logoAssetUrl(nameOrPath: string): string {
  if (!nameOrPath) return nameOrPath;
  const normalized = nameOrPath.startsWith('/logos/')
    ? nameOrPath
    : `/logos/${nameOrPath.replace(/^\/+/, '')}`;
  return publicAssetUrl(normalized);
}

/**
 * Server-side Media File Storage
 *
 * 将媒体文件保存到服务端文件系统。
 * 路径通过 MEDIA_STORAGE_PATH 环境变量配置，默认 ./data/media。
 * 结构: {MEDIA_STORAGE_PATH}/{stageId}/{filename}
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function getMediaBasePath(): string {
  const envPath = process.env.MEDIA_STORAGE_PATH?.trim();
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
  }
  return path.join(process.cwd(), 'data', 'media');
}

/**
 * Ensure `resolved` is still under `base` after path.resolve().
 * Prevents directory traversal via crafted stageId / storageKey.
 */
function assertInsideBase(resolved: string, base: string): void {
  const norm = path.resolve(resolved);
  const normBase = path.resolve(base) + path.sep;
  if (!norm.startsWith(normBase) && norm !== normBase.slice(0, -1)) {
    throw new Error('Path traversal detected');
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return map[mimeType] || '.bin';
}

/**
 * Save a media buffer to the file system.
 * Returns the storageKey (relative path from media base).
 */
export function saveMediaFile(
  stageId: string,
  elementId: string,
  buffer: Buffer,
  mimeType: string,
  suffix?: string,
): string {
  const base = getMediaBasePath();
  const stageDir = path.join(base, stageId);
  assertInsideBase(stageDir, base);
  ensureDir(stageDir);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const ext = extFromMime(mimeType);
  const safeName = elementId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = suffix
    ? `${safeName}_${suffix}_${hash}${ext}`
    : `${safeName}_${hash}${ext}`;

  const filePath = path.join(stageDir, filename);
  fs.writeFileSync(filePath, buffer);

  return `${stageId}/${filename}`;
}

/**
 * Read a media file by storageKey.
 * Returns { buffer, mimeType } or null if not found.
 */
export function readMediaFile(
  storageKey: string,
): { buffer: Buffer; mimeType: string } | null {
  const base = getMediaBasePath();
  const filePath = path.join(base, storageKey);
  assertInsideBase(filePath, base);
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  return { buffer, mimeType: mimeMap[ext] || 'application/octet-stream' };
}

/**
 * Delete all media files for a stage.
 */
export function deleteMediaFilesForStage(stageId: string): void {
  const base = getMediaBasePath();
  const stageDir = path.join(base, stageId);
  assertInsideBase(stageDir, base);
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

/**
 * Delete a single media file by storageKey.
 */
export function deleteMediaFile(storageKey: string): void {
  const base = getMediaBasePath();
  const filePath = path.join(base, storageKey);
  assertInsideBase(filePath, base);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

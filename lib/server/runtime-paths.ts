import path from 'path';

function resolveStoragePath(envName: string): string | undefined {
  const raw = (process.env[envName] || '').trim();
  if (!raw) return undefined;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const defaultDataRoot = path.join(process.cwd(), 'data');

export const DATA_STORAGE_ROOT = resolveStoragePath('MAIC_DATA_ROOT') || defaultDataRoot;
export const CLASSROOMS_STORAGE_PATH =
  resolveStoragePath('CLASSROOMS_STORAGE_PATH') || path.join(DATA_STORAGE_ROOT, 'classrooms');
export const CLASSROOM_JOBS_STORAGE_PATH =
  resolveStoragePath('CLASSROOM_JOBS_STORAGE_PATH') ||
  path.join(DATA_STORAGE_ROOT, 'classroom-jobs');
export const MEDIA_STORAGE_PATH =
  resolveStoragePath('MEDIA_STORAGE_PATH') || CLASSROOMS_STORAGE_PATH;

export function classroomDataFilePath(classroomId: string): string {
  return path.join(CLASSROOMS_STORAGE_PATH, `${classroomId}.json`);
}

export function classroomAssetRoot(classroomId: string): string {
  return path.join(MEDIA_STORAGE_PATH, classroomId);
}

export function classroomAssetDir(classroomId: string, subDir: 'media' | 'audio'): string {
  return path.join(classroomAssetRoot(classroomId), subDir);
}

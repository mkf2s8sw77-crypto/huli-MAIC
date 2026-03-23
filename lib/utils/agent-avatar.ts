import { BASE_PATH } from '@/lib/utils/base-path';

export const GENERATED_AGENT_AVATARS = [
  '/avatars/assist.png',
  '/avatars/assist-2.png',
  '/avatars/clown.png',
  '/avatars/clown-2.png',
  '/avatars/curious.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker.png',
  '/avatars/note-taker-2.png',
  '/avatars/teacher.png',
  '/avatars/teacher-2.png',
  '/avatars/thinker.png',
  '/avatars/thinker-2.png',
] as const;

const KNOWN_AVATARS = new Set<string>(GENERATED_AGENT_AVATARS);
const BASENAME_TO_AVATAR = new Map(
  GENERATED_AGENT_AVATARS.map((avatar) => [avatar.split('/').pop()!, avatar]),
);

function getFallbackAvatar(role?: string, fallback?: string): string {
  if (fallback && KNOWN_AVATARS.has(fallback)) return fallback;
  if (role === 'teacher') return '/avatars/teacher.png';
  if (role === 'assistant') return '/avatars/assist.png';
  return '/avatars/curious.png';
}

export function normalizeAgentAvatar(
  avatar: string | null | undefined,
  options: { role?: string; fallback?: string } = {},
): string {
  const { role, fallback } = options;
  if (!avatar) return getFallbackAvatar(role, fallback);

  let value = avatar.trim();
  if (!value) return getFallbackAvatar(role, fallback);
  if (value.startsWith('data:')) return value;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const avatarIndex = url.pathname.indexOf('/avatars/');
      if (avatarIndex >= 0) {
        value = url.pathname.slice(avatarIndex);
      } else {
        return value;
      }
    } catch {
      return value;
    }
  }

  if (BASE_PATH && value.startsWith(`${BASE_PATH}/`)) {
    value = value.slice(BASE_PATH.length);
  }

  if (value.startsWith('avatars/')) {
    value = `/${value}`;
  }

  const avatarIndex = value.indexOf('/avatars/');
  if (avatarIndex >= 0) {
    value = value.slice(avatarIndex);
  }

  if (KNOWN_AVATARS.has(value)) {
    return value;
  }

  const basename = value.split('/').pop() || value;
  const matched = BASENAME_TO_AVATAR.get(basename);
  if (matched) {
    return matched;
  }

  return getFallbackAvatar(role, fallback);
}

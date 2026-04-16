export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeLoginIdentifier(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isEmailIdentifier(value: string): boolean {
  return value.includes('@');
}

export function validateUsername(username: string): string | null {
  if (!username) return '请输入用户名';
  if (username.includes('@')) return '用户名不能包含 @';
  if (!USERNAME_RE.test(username)) {
    return '用户名需为 3-32 位字母、数字、点、下划线或短横线，并以字母或数字开头';
  }
  return null;
}

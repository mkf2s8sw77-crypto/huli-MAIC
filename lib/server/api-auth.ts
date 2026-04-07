/**
 * API Route Auth Helper
 *
 * 提取当前登录用户 ID，供 API route handler 使用。
 * 未登录时返回 null。
 */

import { auth } from './auth';

export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

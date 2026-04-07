/**
 * Auth.js catch-all route handler
 * 处理 /api/auth/* 下所有认证请求（signin, signout, session, csrf 等）
 */

import { handlers } from '@/lib/server/auth';

export const { GET, POST } = handlers;

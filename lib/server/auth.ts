/**
 * Auth.js (NextAuth v5) — 完整配置（Node Runtime）
 *
 * 在 auth.config.ts（Edge-safe）基础上添加 Credentials provider。
 * 此文件引入 better-sqlite3 和 bcryptjs，只能在 Node Runtime 中使用。
 *
 * 导出：
 *   - handlers: route handler（/api/auth/[...nextauth]）
 *   - signIn / signOut: 服务端登录/登出方法
 *   - auth: 获取 session（用于 Server Component / Route Handler）
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { getDb } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { runMigrations } from './db/migrate';
import { authConfig } from './auth.config';

let _migrated = false;

function ensureMigrated() {
  if (!_migrated) {
    try {
      runMigrations();
    } catch {
      // migration 可能已执行，忽略
    }
    _migrated = true;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        ensureMigrated();

        const email = (credentials?.email as string)?.trim().toLowerCase();
        const password = credentials?.password as string;
        if (!email || !password) return null;

        const db = getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.nickname || user.name || user.email,
          image: user.avatar || user.image,
        };
      },
    }),
  ],
});

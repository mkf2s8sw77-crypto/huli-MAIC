/**
 * 用户注册 API
 * POST /api/auth/register
 *
 * 接受 { email, username, password, nickname? } 创建新用户。
 * 密码使用 bcryptjs 哈希后存储，永不保存明文。
 */

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { getDb } from '@/lib/server/db';
import { users } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { runMigrations } from '@/lib/server/db/migrate';
import {
  EMAIL_RE,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
} from '@/lib/auth/identity';

let _migrated = false;
function ensureMigrated() {
  if (!_migrated) {
    try {
      runMigrations();
    } catch {
      // already migrated
    }
    _migrated = true;
  }
}

const MIN_PASSWORD_LENGTH = 6;

export async function POST(req: NextRequest) {
  try {
    ensureMigrated();

    const body = await req.json();
    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username);
    const password = body.password as string;
    const nickname = (body.nickname as string)?.trim() || '';

    // 校验
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符` },
        { status: 400 },
      );
    }

    const db = getDb();

    // 检查重复邮箱
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
    }
    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (existingUsername) {
      return NextResponse.json({ error: '该用户名已被注册' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        username,
        passwordHash,
        nickname: nickname || username,
        name: nickname || username,
      })
      .returning({ id: users.id, email: users.email, username: users.username });

    return NextResponse.json(
      {
        success: true,
        user: { id: newUser.id, email: newUser.email, username: newUser.username },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[Register] Error:', error);
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}

/**
 * 用户资料 API
 *
 * GET  /api/auth/profile — 获取当前登录用户的资料
 * PATCH /api/auth/profile — 更新当前登录用户的 nickname / bio / avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { users } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      bio: users.bio,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.nickname === 'string') {
    updates.nickname = body.nickname.trim().slice(0, 50);
  }
  if (typeof body.bio === 'string') {
    updates.bio = body.bio.trim().slice(0, 500);
  }
  if (typeof body.avatar === 'string') {
    updates.avatar = body.avatar.slice(0, 100_000);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const db = getDb();
  await db.update(users).set(updates).where(eq(users.id, session.user.id));

  const [updated] = await db
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      bio: users.bio,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return NextResponse.json(updated);
}

/**
 * Legacy classroom file-based API — DISABLED
 *
 * 此端点属于上游遗留的文件型课程存储，不走 SQLite + owner 校验。
 * 当前 fork 已通过 /api/stages 实现完整账号体系，此路由不再对外服务。
 * 保留文件以降低与 upstream 合并冲突。
 */

import { NextResponse } from 'next/server';

const GONE_BODY = { success: false, error: 'This endpoint has been replaced by /api/stages' };

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

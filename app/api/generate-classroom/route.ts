/**
 * Legacy classroom generation API — DISABLED
 *
 * 此端点属于上游遗留的文件型课程生成，不走 SQLite + owner 校验。
 * 当前 fork 已通过 /api/stages + generation-preview 流程实现完整账号体系。
 * 保留文件以降低与 upstream 合并冲突。
 */

import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been replaced by the stages-based generation flow' },
    { status: 410 },
  );
}

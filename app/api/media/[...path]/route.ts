/**
 * GET /api/media/:stageId/:filename — 提供媒体文件访问
 *
 * 通过 storageKey（相对路径）从服务端文件系统读取并返回。
 * 需要登录（middleware）且校验请求者是 stage owner。
 */

import { type NextRequest, NextResponse } from 'next/server';
import { readMediaFile } from '@/lib/server/media-storage';
import { getAuthUserId } from '@/lib/server/api-auth';
import { isStageOwner } from '@/lib/server/db/stage-repository';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { path: segments } = await params;
  // Current storage keys are always `{stageId}/{filename}`.
  // Reject any unexpected nesting or dot-segments so owner checks cannot be
  // bypassed via crafted paths like `my-stage/../other-stage/file.png`.
  if (
    segments.length !== 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))
  ) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const stageId = segments[0];
  if (!(await isStageOwner(stageId, userId))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const storageKey = segments.join('/');

  let result: { buffer: Buffer; mimeType: string } | null;
  try {
    result = readMediaFile(storageKey);
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (!result) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const uint8 = new Uint8Array(result.buffer);
  return new NextResponse(uint8, {
    headers: {
      'Content-Type': result.mimeType,
      'Content-Length': String(uint8.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

import path from 'path';
import { type NextRequest } from 'next/server';
import { servePublicAsset } from '@/lib/server/public-asset-route';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;
  return servePublicAsset(path.join(process.cwd(), 'public', 'logos'), pathSegments);
}

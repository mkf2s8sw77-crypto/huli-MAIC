import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'This endpoint belongs to the deprecated file-based classroom generation flow and is no longer available',
    },
    { status: 410 },
  );
}

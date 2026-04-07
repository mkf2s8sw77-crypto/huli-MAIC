import { NextResponse } from 'next/server';

const GONE_BODY = {
  success: false,
  error: 'This endpoint belongs to the deprecated file-based classroom flow and is no longer available',
};

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

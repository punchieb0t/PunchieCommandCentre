import { NextResponse } from 'next/server';
import { getCryptoPrices } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const crypto = getCryptoPrices();
    return NextResponse.json({ crypto, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

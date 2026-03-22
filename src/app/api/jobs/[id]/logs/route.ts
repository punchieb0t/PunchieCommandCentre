import { NextRequest, NextResponse } from 'next/server';
import { getJobLogs } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type');
  
  try {
    const logs = getJobLogs(id || '', type || '');
    return NextResponse.json({ jobId: id, type, logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

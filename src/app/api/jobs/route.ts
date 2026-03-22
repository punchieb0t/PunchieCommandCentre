import { NextResponse } from 'next/server';
import { getAllJobs, getJobLogs } from '@/lib/data';

export async function GET() {
  try {
    const jobs = getAllJobs();
    return NextResponse.json(jobs);
  } catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
  }
}

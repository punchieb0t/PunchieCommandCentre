import { NextResponse } from 'next/server';
import { getSystemStats, getCryptoPrices, getWeather, getBackupStatus, getServices } from '@/lib/status';

const STATUS_CACHE_TTL = 60000;
let statusCache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };

export async function GET() {
  try {
    const now = Date.now();
    if (statusCache.data && (now - statusCache.timestamp) < STATUS_CACHE_TTL) {
      return NextResponse.json(statusCache.data);
    }
    
    const data = {
      system: getSystemStats(),
      crypto: getCryptoPrices(),
      weather: getWeather(),
      backups: getBackupStatus(),
      services: getServices(),
      timestamp: new Date().toISOString()
    };
    
    statusCache = { data, timestamp: now };
    return NextResponse.json(data);
  } catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  statusCache = { data: null, timestamp: 0 };
  return NextResponse.json({ status: 'cache cleared' });
}

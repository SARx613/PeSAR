/**
 * GET /api/latest-rate
 * Returns the last scraped rate from Upstash Redis.
 * Used by the mobile app as a fallback when dolarapi.com is unavailable.
 *
 * Environment variables:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface RatePoint {
  rate: number;
  timestamp: string;
}

export async function GET(_req: Request): Promise<Response> {
  try {
    const raw = await redis.get<string>('latest_rate');

    if (!raw) {
      return Response.json({ ok: false, error: 'No rate available yet' }, { status: 404 });
    }

    const point = typeof raw === 'string' ? (JSON.parse(raw) as RatePoint) : (raw as unknown as RatePoint);
    return Response.json({ ok: true, rate: point.rate, timestamp: point.timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

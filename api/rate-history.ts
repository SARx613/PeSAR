/**
 * GET /api/rate-history
 * Returns the last 96 rate points (24h of history) from Upstash Redis.
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
    const raw = await redis.lrange('rate_history', 0, -1);

    const history: RatePoint[] = (raw ?? [])
      .map((item) => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as RatePoint[];

    return Response.json({ ok: true, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, history: [], error: message }, { status: 500 });
  }
}

/**
 * POST /api/register-token
 * Body: { token: string }
 *
 * Adds an Expo push token to the Redis set so the cron scraper
 * can send silent push notifications to it.
 *
 * Environment variables:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { token?: string };
    const { token } = body;

    if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
      return Response.json(
        { ok: false, error: 'Invalid or missing Expo push token' },
        { status: 400 },
      );
    }

    await redis.sadd('push_tokens', token);
    return Response.json({ ok: true, message: 'Token registered' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

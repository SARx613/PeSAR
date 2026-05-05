/**
 * Vercel Serverless Function — triggered every 15 minutes by GitHub Actions.
 *
 * What it does:
 *  1. Fetches the current EUR→ARS Western Union rate from dolarapi.com
 *  2. Stores it in Upstash Redis (latest rate + rolling 24h history)
 *  3. Sends a silent push notification to all registered Expo push tokens
 *
 * Environment variables required in Vercel dashboard:
 *   UPSTASH_REDIS_REST_URL    — from your Upstash Redis database
 *   UPSTASH_REDIS_REST_TOKEN  — from your Upstash Redis database
 *   CRON_SECRET               — a random secret string (also set in GitHub Secrets)
 *
 * GitHub Actions secrets required (repo Settings → Secrets → Actions):
 *   VERCEL_APP_URL  — e.g. https://pesar.vercel.app
 *   CRON_SECRET     — same value as in Vercel
 */

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Western Union USD→ARS rate (dolarapi.com correct endpoint)
const WU_USD_ARS_URL = 'https://dolarapi.com/v1/dolares/western';
// EUR→USD rate (Frankfurter — free, no auth, maintained by ECB data)
const EUR_USD_URL = 'https://api.frankfurter.app/latest?from=EUR&to=USD';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface DolarApiResponse {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: { USD: number };
}

interface RatePoint {
  rate: number;
  timestamp: string;
}

interface ExpoPushMessage {
  to: string;
  sound: 'default' | null;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  _contentAvailable?: boolean;
  priority?: 'default' | 'normal' | 'high';
}

async function fetchRate(): Promise<{ rate: number; timestamp: string }> {
  // Fetch both in parallel for speed
  const [wuRes, fxRes] = await Promise.all([
    fetch(WU_USD_ARS_URL, { headers: { Accept: 'application/json' } }),
    fetch(EUR_USD_URL, { headers: { Accept: 'application/json' } }),
  ]);

  if (!wuRes.ok) throw new Error(`dolarapi.com/dolares/western returned ${wuRes.status}`);
  if (!fxRes.ok) throw new Error(`frankfurter.app returned ${fxRes.status}`);

  const wuData = (await wuRes.json()) as DolarApiResponse;
  const fxData = (await fxRes.json()) as FrankfurterResponse;

  // WU sell rate: how many ARS you get per 1 USD via Western Union
  const usdArs = parseFloat(String(wuData.venta));
  // EUR/USD mid rate from ECB
  const eurUsd = fxData.rates.USD;

  if (isNaN(usdArs) || usdArs <= 0) throw new Error(`Invalid USD/ARS rate: ${wuData.venta}`);
  if (isNaN(eurUsd) || eurUsd <= 0) throw new Error(`Invalid EUR/USD rate: ${fxData.rates.USD}`);

  // EUR→ARS = (USD/ARS via WU) / (EUR/USD)  →  ARS per 1 EUR
  const eurArs = usdArs / eurUsd;

  return {
    rate: Math.round(eurArs * 100) / 100,
    timestamp: wuData.fechaActualizacion ?? new Date().toISOString(),
  };
}

async function storeRate(rate: number, timestamp: string): Promise<void> {
  const point: RatePoint = { rate, timestamp };

  // Store the latest rate as a simple key
  await redis.set('latest_rate', JSON.stringify(point));

  // Push to history list (newest last)
  await redis.rpush('rate_history', JSON.stringify(point));

  // Keep only last 96 entries (24h at 15-min intervals)
  await redis.ltrim('rate_history', -96, -1);
}

async function sendSilentPushToAll(rate: number, timestamp: string): Promise<void> {
  const rawTokens = await redis.smembers('push_tokens');
  const tokens: string[] = (rawTokens ?? []).filter((t): t is string => typeof t === 'string');
  if (tokens.length === 0) return;

  // Batch into groups of 100 (Expo push API limit)
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const messages: ExpoPushMessage[] = batch.map((token) => ({
      to: token,
      sound: null,
      _contentAvailable: true, // silent push on iOS
      priority: 'normal',
      data: { rate, timestamp, type: 'rate_update' },
    }));

    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
    } catch (err) {
      console.error('[push] batch failed:', err);
    }
  }
}

export async function GET(req: Request): Promise<Response> {
  // Protect the endpoint with a secret so only the GitHub Action can call it.
  // Set CRON_SECRET in both Vercel dashboard AND GitHub Actions secrets.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { rate, timestamp } = await fetchRate();

    await storeRate(rate, timestamp);
    await sendSilentPushToAll(rate, timestamp);

    return Response.json({ ok: true, rate, timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scrape-rate] Error:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

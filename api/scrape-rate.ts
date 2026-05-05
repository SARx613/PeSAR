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

// Western Union send-money page (SSR Angular — HTML contains the live rate)
// SendAmount=1.00 EUR → ARS so the exchange rate IS the receive amount
const WU_URL =
  'https://www.westernunion.com/fr/fr/web/send-money/start' +
  '?ReceiveCountry=AR&ISOCurrency=ARS&SendAmount=1.00&FundsOut=AG&FundsIn=CreditCard';

// dolarapi fallback (EUR official bank rate)
const COTIZACIONES_URL = 'https://dolarapi.com/v1/cotizaciones';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

/**
 * Scrape the Western Union send-money page.
 * The page is Angular SSR — the exchange rate is in the initial HTML response.
 * Target element: <span id="exchangeRate">1.00 EUR = 1,733.9148 ARS</span>
 */
async function scrapeWURate(): Promise<{ rate: number; timestamp: string }> {
  const res = await fetch(WU_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
  });

  if (!res.ok) throw new Error(`WU returned HTTP ${res.status}`);

  const html = await res.text();

  // Match: id="exchangeRate" ...>1.00 EUR = 1,733.9148 ARS</span>
  const match = html.match(/id="exchangeRate"[^>]*>\s*([^<]+?)\s*<\/span>/);
  if (!match) throw new Error('exchangeRate element not found in WU HTML');

  // Parse the ARS value from "1.00 EUR = 1,733.9148 ARS"
  const rateMatch = match[1].match(/=\s*([\d,]+(?:\.\d+)?)\s*ARS/);
  if (!rateMatch) throw new Error(`Could not parse rate from: "${match[1]}"`);

  // Remove thousands-separator comma (WU uses 1,733.9148 format)
  const rate = parseFloat(rateMatch[1].replace(/,/g, ''));
  if (isNaN(rate) || rate <= 0) throw new Error(`Invalid parsed rate: ${rateMatch[1]}`);

  return { rate: Math.round(rate * 100) / 100, timestamp: new Date().toISOString() };
}

/**
 * Fallback: dolarapi.com official EUR/ARS rate.
 */
async function fetchDolarApiRate(): Promise<{ rate: number; timestamp: string }> {
  const res = await fetch(COTIZACIONES_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`dolarapi returned ${res.status}`);

  const data = (await res.json()) as Array<{
    moneda: string;
    venta: number;
    fechaActualizacion?: string;
  }>;
  const eur = data.find((c) => c.moneda === 'EUR');
  if (!eur) throw new Error('EUR entry not found in dolarapi');

  const rate = Math.round(parseFloat(String(eur.venta)) * 100) / 100;
  if (isNaN(rate) || rate <= 0) throw new Error(`Invalid rate: ${eur.venta}`);

  return { rate, timestamp: eur.fechaActualizacion ?? new Date().toISOString() };
}

async function fetchRate(): Promise<{ rate: number; timestamp: string; source: string }> {
  try {
    const result = await scrapeWURate();
    return { ...result, source: 'western_union' };
  } catch (err) {
    console.warn('[scrape] WU scraping failed, falling back to dolarapi:', err);
    const result = await fetchDolarApiRate();
    return { ...result, source: 'dolarapi_fallback' };
  }
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
    const { rate, timestamp, source } = await fetchRate();

    await storeRate(rate, timestamp);
    await sendSilentPushToAll(rate, timestamp);

    return Response.json({ ok: true, rate, timestamp, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scrape-rate] Error:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

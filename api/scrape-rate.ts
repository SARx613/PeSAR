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

// ─── Western Union GraphQL router (public, same endpoint as wu.com SPA) ───────
const WU_ROUTER_URL = process.env.WU_ROUTER_URL?.trim() ?? 'https://www.westernunion.com/router/';
const WU_ACCESS_CODE = process.env.WU_ACCESS_CODE?.trim() ?? 'RtYV3XDz9EA';
const WU_SEND_COUNTRY = process.env.WU_SEND_COUNTRY_CODE?.trim().toUpperCase() ?? 'ES'; // Spain
const WU_LANGUAGE = process.env.WU_LANGUAGE_CODE?.trim().toLowerCase() ?? 'es';
const WU_RECV_COUNTRY = process.env.WU_RECEIVE_COUNTRY_CODE?.trim().toUpperCase() ?? 'AR';
const WU_RECV_CURRENCY = process.env.WU_RECEIVE_CURRENCY_CODE?.trim().toUpperCase() ?? 'ARS';
const WU_SEND_AMOUNT_EUR = Number(process.env.WU_QUOTE_EUR_AMOUNT ?? '100');

// ─── dolarapi fallback ─────────────────────────────────────────────────────────
const COTIZACIONES_URL = 'https://dolarapi.com/v1/cotizaciones';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── GraphQL documents (identical to WilliamPltr/WesternUnion-Taux-EUR-PESOS) ─
const CREATE_SESSION_MUTATION = `
mutation createSession($req: CreateSessionInput) {
  createSession(input: $req) {
    ... on CreateSessionResponse {
      security { session { id } }
    }
    ... on ErrorResponse { errorCode message }
  }
}`;

const PRODUCTS_QUERY = `
query products($req_products: ProductsInput) {
  products(input: $req_products) {
    ... on ProductsResponse {
      products { exchangeRate }
    }
    ... on ErrorResponse { errorCode message }
  }
}`;

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

function randomDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `wu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postWUGraphQL<T>(
  operationName: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(WU_ROUTER_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/json',
      'x-wu-operationname': operationName,
      'x-wu-accesscode': WU_ACCESS_CODE,
      'User-Agent': 'Mozilla/5.0 (compatible; WURateCheck/1.0)',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: T & { errors?: Array<{ message?: string }> };
  try {
    json = JSON.parse(text) as T & { errors?: Array<{ message?: string }> };
  } catch {
    throw new Error(`WU router non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`WU router HTTP ${res.status}: ${text.slice(0, 300)}`);
  if ((json as { errors?: Array<{ message?: string }> }).errors?.length) {
    const errs = (json as { errors: Array<{ message?: string }> }).errors;
    throw new Error(`WU GraphQL error: ${errs.map((e) => e.message).join('; ')}`);
  }
  return json;
}

/**
 * Fetch EUR→ARS rate via Western Union's public GraphQL router.
 * Two-step: createSession → products (price catalog).
 */
async function fetchWURate(): Promise<{ rate: number; timestamp: string }> {
  const sessionHeaders = { wucountrycode: WU_SEND_COUNTRY, wulanguagecode: WU_LANGUAGE };

  // Step 1 — create session
  const sessionRes = await postWUGraphQL<{
    data?: { createSession?: { security?: { session?: { id?: string } } } };
  }>(
    'createSession',
    {
      query: CREATE_SESSION_MUTATION,
      variables: {
        req: {
          businessMode: 'DIGITAL',
          externalReferenceNo: '1',
          locale: { countryCode: WU_SEND_COUNTRY, languageCode: WU_LANGUAGE },
          security: {
            requestHeader: [{ key: 'isRREnabled', value: 'false' }],
            blackBoxData: { id: '101569194', length: '0' },
          },
          device: { type: 'WEB' },
          channel: {
            type: 'WEB',
            name: 'Western Union',
            version: '9Z00',
            isResponsive: 'true',
            deviceIdentifier: 'RESPONSIVE_WEB',
          },
        },
      },
    },
    sessionHeaders,
  );

  const sessionId = sessionRes.data?.createSession?.security?.session?.id;
  if (!sessionId) throw new Error('WU createSession did not return a session id');
  console.log('[WU GraphQL] Session created:', sessionId.slice(0, 8) + '…');

  // Step 2 — price catalog (products)
  const ts = Date.now();
  const amountCents = Number((100 * WU_SEND_AMOUNT_EUR).toFixed(2));

  const productsRes = await postWUGraphQL<{
    data?: { products?: { products?: Array<{ exchangeRate?: number }> } };
  }>(
    'products',
    {
      query: PRODUCTS_QUERY,
      variables: {
        req_products: {
          origination: {
            channel: 'WWEB',
            client: 'WUCOM',
            countryIsoCode: WU_SEND_COUNTRY,
            currencyIsoCode: 'EUR',
            eflType: 'STATE',
            amount: amountCents,
            fundsIn: '*',
            airRequested: 'Y',
          },
          destination: { countryIsoCode: WU_RECV_COUNTRY, currencyIsoCode: WU_RECV_CURRENCY },
          language: WU_LANGUAGE,
          headerRequest: {
            version: '0.5',
            requestType: 'PRICECATALOG',
            correlationId: sessionId,
            transactionId: `${sessionId}-${ts}`,
          },
          visit: {
            localDatetime: { timeZone: new Date().getTimezoneOffset(), timestampMs: ts },
          },
        },
      },
    },
    { wucountrycode: WU_SEND_COUNTRY, wulanguagecode: WU_LANGUAGE, 'device-id': randomDeviceId() },
  );

  const first = productsRes.data?.products?.products?.find(
    (p) => typeof p.exchangeRate === 'number',
  );
  const rate = first?.exchangeRate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('WU products response did not include exchangeRate');
  }

  console.log('[WU GraphQL] Exchange rate:', rate, 'ARS/EUR');
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
    const result = await fetchWURate();
    return { ...result, source: 'western_union_graphql' };
  } catch (err) {
    console.warn('[scrape] WU GraphQL failed, falling back to dolarapi:', err);
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

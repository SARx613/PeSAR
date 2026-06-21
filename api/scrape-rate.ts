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
import webpush from 'web-push';

const redis = Redis.fromEnv();

// ─── Web Push (VAPID) — for the PWA alerts ──────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:alerts@pesar.app';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

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

  // Keep last 8 640 entries (~3 months at 15-min intervals)
  await redis.ltrim('rate_history', -8640, -1);
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

// ─── Rate alerts (Web Push) ─────────────────────────────────────────────────────
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
interface StoredAlert {
  id: string;
  clientId: string;
  type: 'threshold' | 'percent' | 'extreme';
  direction?: 'above' | 'below';
  value?: number;
  window?: '1D' | '1W' | '1M';
  percent?: number;
  extreme?: 'high' | 'low';
  message?: string;
  lastTriggeredAt?: string;
  subscription: PushSubscription;
}

const WINDOW_DAYS: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30 };
// Don't re-fire the same alert more than once per this window.
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 h

function fmtRate(r: number): string {
  return new Intl.NumberFormat('fr-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r);
}

/** Read the rolling history list and return points within `days`. */
async function historyWithin(days: number): Promise<RatePoint[]> {
  const raw = (await redis.lrange('rate_history', 0, -1)) as Array<string | RatePoint>;
  const cutoff = Date.now() - days * 86400000;
  const points: RatePoint[] = [];
  for (const r of raw) {
    try {
      const p = typeof r === 'string' ? (JSON.parse(r) as RatePoint) : r;
      if (new Date(p.timestamp).getTime() >= cutoff) points.push(p);
    } catch {
      /* skip malformed */
    }
  }
  return points;
}

/** Decide whether an alert fires for the new rate. Returns a message or null. */
async function evaluateAlert(a: StoredAlert, rate: number): Promise<string | null> {
  if (a.type === 'threshold') {
    if (a.direction === 'above' && a.value != null && rate >= a.value) {
      return a.message || `1 € a dépassé ${fmtRate(a.value)} ARS (actuel : ${fmtRate(rate)}).`;
    }
    if (a.direction === 'below' && a.value != null && rate <= a.value) {
      return a.message || `1 € est descendu sous ${fmtRate(a.value)} ARS (actuel : ${fmtRate(rate)}).`;
    }
    return null;
  }

  if (a.type === 'percent') {
    const days = WINDOW_DAYS[a.window || '1D'];
    const pts = await historyWithin(days);
    if (pts.length < 2 || a.percent == null) return null;
    const first = pts[0].rate;
    const change = ((rate - first) / first) * 100;
    if (Math.abs(change) >= a.percent) {
      const dir = change >= 0 ? 'hausse' : 'baisse';
      const sign = change >= 0 ? '+' : '−';
      const label = a.window === '1W' ? 'cette semaine' : a.window === '1M' ? 'ce mois' : 'aujourd’hui';
      return a.message || `${dir} de ${sign}${Math.abs(change).toFixed(2)}% ${label} (1 € = ${fmtRate(rate)} ARS).`;
    }
    return null;
  }

  if (a.type === 'extreme') {
    const days = WINDOW_DAYS[a.window || '1M'];
    const pts = await historyWithin(days);
    if (pts.length < 2) return null;
    const rates = pts.map((p) => p.rate);
    if (a.extreme === 'high' && rate >= Math.max(...rates)) {
      return a.message || `Nouveau plus haut sur ${a.window === '1W' ? '7 jours' : '30 jours'} : 1 € = ${fmtRate(rate)} ARS.`;
    }
    if (a.extreme === 'low' && rate <= Math.min(...rates)) {
      return a.message || `Nouveau plus bas sur ${a.window === '1W' ? '7 jours' : '30 jours'} : 1 € = ${fmtRate(rate)} ARS.`;
    }
    return null;
  }

  return null;
}

async function sendWebPushAlert(a: StoredAlert, body: string): Promise<void> {
  const payload = JSON.stringify({
    title: 'PeSAR — Alerte taux',
    body,
    tag: 'pesar-alert-' + a.id,
    url: '/',
  });
  try {
    await webpush.sendNotification(a.subscription as webpush.PushSubscription, payload);
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 404/410 → subscription is dead; clean it up so we stop trying.
    if (statusCode === 404 || statusCode === 410) {
      await redis.del(`alert:${a.id}`);
      await redis.srem('alerts:all', a.id);
      await redis.srem(`alerts:client:${a.clientId}`, a.id);
    } else {
      console.error('[web-push] send failed:', statusCode, err);
    }
  }
}

/** Evaluate every stored alert against the new rate and notify the matching ones. */
async function processAlerts(rate: number): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // Web Push not configured yet
  const ids = (await redis.smembers('alerts:all')) as string[];
  if (!ids.length) return;

  const raw = await redis.mget<Array<string | StoredAlert>>(...ids.map((i) => `alert:${i}`));
  const now = Date.now();

  for (const item of raw) {
    if (!item) continue;
    let a: StoredAlert;
    try {
      a = (typeof item === 'string' ? JSON.parse(item) : item) as StoredAlert;
    } catch {
      continue;
    }

    // Cooldown so a satisfied condition doesn't spam every 15 min.
    if (a.lastTriggeredAt && now - new Date(a.lastTriggeredAt).getTime() < ALERT_COOLDOWN_MS) continue;

    const body = await evaluateAlert(a, rate);
    if (!body) continue;

    await sendWebPushAlert(a, body);
    a.lastTriggeredAt = new Date().toISOString();
    await redis.set(`alert:${a.id}`, JSON.stringify(a));
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
    await sendSilentPushToAll(rate, timestamp);   // Expo (native app)
    await processAlerts(rate);                     // Web Push (PWA alerts)

    return Response.json({ ok: true, rate, timestamp, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scrape-rate] Error:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

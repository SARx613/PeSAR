/**
 * /api/alerts — manage Web Push rate alerts.
 *
 *   POST   { action: 'create', subscription, alert }   → create an alert
 *   POST   { action: 'list',   clientId }              → list a client's alerts
 *   POST   { action: 'delete', clientId, id }          → delete one alert
 *
 * An "alert" is a condition that, once met by the scraper, triggers a Web Push.
 * Each alert stores its own push subscription so the cron can notify it directly.
 *
 * Storage (Upstash Redis):
 *   alerts:all                 → SET of alert ids (used by the cron to iterate)
 *   alerts:client:<clientId>   → SET of alert ids belonging to one device
 *   alert:<id>                 → JSON blob of the alert
 *
 * Environment variables:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

type AlertType = 'threshold' | 'percent' | 'extreme';

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface StoredAlert {
  id: string;
  clientId: string;
  type: AlertType;
  // threshold
  direction?: 'above' | 'below';
  value?: number;
  // percent
  window?: '1D' | '1W' | '1M';
  percent?: number;
  // extreme
  extreme?: 'high' | 'low';
  // common
  message?: string;
  createdAt: string;
  lastTriggeredAt?: string;
  subscription: PushSubscription;
}

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateAlert(a: Record<string, unknown>): string | null {
  if (a.type === 'threshold') {
    if (a.direction !== 'above' && a.direction !== 'below') return 'direction invalide';
    if (typeof a.value !== 'number' || !Number.isFinite(a.value) || a.value <= 0) return 'valeur invalide';
    return null;
  }
  if (a.type === 'percent') {
    if (!['1D', '1W', '1M'].includes(a.window as string)) return 'fenêtre invalide';
    if (typeof a.percent !== 'number' || !Number.isFinite(a.percent) || a.percent <= 0) return 'pourcentage invalide';
    return null;
  }
  if (a.type === 'extreme') {
    if (a.extreme !== 'high' && a.extreme !== 'low') return 'type extrême invalide';
    if (!['1W', '1M'].includes((a.window as string) ?? '1M')) return 'fenêtre invalide';
    return null;
  }
  return 'type d’alerte inconnu';
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad('JSON invalide');
  }

  const action = body.action;

  try {
    if (action === 'create') {
      const sub = body.subscription as PushSubscription | undefined;
      const alert = body.alert as Record<string, unknown> | undefined;
      const clientId = body.clientId as string | undefined;

      if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return bad('abonnement push invalide');
      if (!clientId || typeof clientId !== 'string') return bad('clientId manquant');
      if (!alert) return bad('alerte manquante');

      const err = validateAlert(alert);
      if (err) return bad(err);

      // Limit alerts per device to keep things sane.
      const existing = await redis.scard(`alerts:client:${clientId}`);
      if (existing >= 20) return bad('Limite de 20 alertes atteinte', 409);

      const id = newId();
      const stored: StoredAlert = {
        id,
        clientId,
        type: alert.type as AlertType,
        direction: alert.direction as 'above' | 'below' | undefined,
        value: alert.value as number | undefined,
        window: alert.window as '1D' | '1W' | '1M' | undefined,
        percent: alert.percent as number | undefined,
        extreme: alert.extreme as 'high' | 'low' | undefined,
        message: typeof alert.message === 'string' ? (alert.message as string).slice(0, 140) : undefined,
        createdAt: new Date().toISOString(),
        subscription: sub,
      };

      await redis.set(`alert:${id}`, JSON.stringify(stored));
      await redis.sadd('alerts:all', id);
      await redis.sadd(`alerts:client:${clientId}`, id);

      return Response.json({ ok: true, id, alert: stripSub(stored) });
    }

    if (action === 'list') {
      const clientId = body.clientId as string | undefined;
      if (!clientId) return bad('clientId manquant');
      const ids = (await redis.smembers(`alerts:client:${clientId}`)) as string[];
      if (!ids.length) return Response.json({ ok: true, alerts: [] });
      const raw = await redis.mget<string[]>(...ids.map((i) => `alert:${i}`));
      const alerts = raw
        .map((r) => parseAlert(r))
        .filter((a): a is StoredAlert => a !== null)
        .map(stripSub);
      return Response.json({ ok: true, alerts });
    }

    if (action === 'delete') {
      const clientId = body.clientId as string | undefined;
      const id = body.id as string | undefined;
      if (!clientId || !id) return bad('clientId ou id manquant');
      // Only allow deleting an alert that belongs to this client.
      const owns = await redis.sismember(`alerts:client:${clientId}`, id);
      if (!owns) return bad('Alerte introuvable', 404);
      await redis.del(`alert:${id}`);
      await redis.srem('alerts:all', id);
      await redis.srem(`alerts:client:${clientId}`, id);
      return Response.json({ ok: true });
    }

    return bad('action inconnue');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

function parseAlert(raw: unknown): StoredAlert | null {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as StoredAlert) : (raw as StoredAlert);
  } catch {
    return null;
  }
}

/** Never send the push subscription back to the client. */
function stripSub(a: StoredAlert) {
  const { subscription, clientId, ...rest } = a;
  void subscription;
  void clientId;
  return rest;
}

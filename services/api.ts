// EUR/ARS official rate (used by Western Union in Argentina)
const COTIZACIONES_URL = 'https://dolarapi.com/v1/cotizaciones';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

export interface RateResponse {
  rate: number;
  source: 'dolarapi' | 'backend' | 'western_union';
  timestamp: string;
}

export interface HistoryResponse {
  history: Array<{ rate: number; timestamp: string }>;
}

/**
 * Fetch current EUR→ARS rate from dolarapi.com (Western Union cotización).
 * Falls back to the Vercel backend cache if the primary source fails.
 */
export async function fetchCurrentRate(): Promise<RateResponse> {
  try {
    const res = await fetch(COTIZACIONES_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`dolarapi returned ${res.status}`);

    const data: Array<{ moneda: string; venta: number; fechaActualizacion?: string }> =
      await res.json();

    const eur = data.find((c) => c.moneda === 'EUR');
    if (!eur) throw new Error('EUR entry not found');

    const rate = Math.round(parseFloat(String(eur.venta)) * 100) / 100;
    if (isNaN(rate) || rate <= 0) throw new Error('Invalid EUR/ARS rate');

    return {
      rate,
      source: 'dolarapi',
      timestamp: eur.fechaActualizacion ?? new Date().toISOString(),
    };
  } catch (primaryError) {
    console.warn('[api] primary fetch failed, trying backend cache:', primaryError);
    return fetchFromBackend();
  }
}

/**
 * Fetch the latest rate from the Vercel backend cache (Vercel KV).
 */
async function fetchFromBackend(): Promise<RateResponse> {
  if (!BACKEND_URL) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is not configured and dolarapi is unreachable');
  }

  const response = await fetch(`${BACKEND_URL}/api/latest-rate`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`);
  }

  const data = await response.json();
  return {
    rate: data.rate,
    source: 'backend',
    timestamp: data.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Fetch rate history from the Vercel backend (last 24h).
 */
export async function fetchRateHistory(): Promise<HistoryResponse> {
  if (!BACKEND_URL) {
    return { history: [] };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/rate-history`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return { history: [] };
    }

    return await response.json();
  } catch {
    return { history: [] };
  }
}

/**
 * Register an Expo push token with the backend.
 */
export async function registerPushToken(token: string): Promise<void> {
  if (!BACKEND_URL) return;

  try {
    await fetch(`${BACKEND_URL}/api/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn('[api] Failed to register push token:', err);
  }
}

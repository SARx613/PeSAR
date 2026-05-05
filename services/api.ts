const DOLAR_API_BASE = 'https://dolarapi.com/v1';
const WU_FALLBACK_URL = 'https://www.westernunion.com/api/v2/exchange-rates/latest?from_currency=EUR&to_currency=ARS';
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
    const response = await fetch(`${DOLAR_API_BASE}/cotizaciones/western`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`dolarapi responded with status ${response.status}`);
    }

    const data = await response.json();

    // dolarapi returns { moneda, casa, nombre, compra, venta, fechaActualizacion }
    // "venta" is the sell rate (what you get when you exchange EUR→ARS)
    const rate = parseFloat(data.venta);
    if (isNaN(rate) || rate <= 0) {
      throw new Error('Invalid rate received from dolarapi');
    }

    return {
      rate,
      source: 'dolarapi',
      timestamp: data.fechaActualizacion ?? new Date().toISOString(),
    };
  } catch (primaryError) {
    console.warn('[api] dolarapi failed, trying backend cache:', primaryError);
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

// Western Union USD→ARS (dolarapi.com correct endpoint)
const WU_USD_ARS_URL = 'https://dolarapi.com/v1/dolares/western';
// EUR→USD mid rate (ECB data via Frankfurter, free, no auth)
const EUR_USD_URL = 'https://api.frankfurter.app/latest?from=EUR&to=USD';
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
    // Fetch WU USD/ARS and EUR/USD in parallel
    const [wuRes, fxRes] = await Promise.all([
      fetch(WU_USD_ARS_URL, { headers: { Accept: 'application/json' } }),
      fetch(EUR_USD_URL, { headers: { Accept: 'application/json' } }),
    ]);

    if (!wuRes.ok) throw new Error(`dolarapi returned ${wuRes.status}`);
    if (!fxRes.ok) throw new Error(`frankfurter returned ${fxRes.status}`);

    const wuData = await wuRes.json();
    const fxData = await fxRes.json();

    const usdArs = parseFloat(String(wuData.venta));
    const eurUsd = fxData.rates?.USD as number;

    if (isNaN(usdArs) || usdArs <= 0) throw new Error('Invalid USD/ARS rate');
    if (isNaN(eurUsd) || eurUsd <= 0) throw new Error('Invalid EUR/USD rate');

    // EUR→ARS = (USD/ARS via WU) / (EUR/USD)
    const eurArs = Math.round((usdArs / eurUsd) * 100) / 100;

    return {
      rate: eurArs,
      source: 'dolarapi',
      timestamp: wuData.fechaActualizacion ?? new Date().toISOString(),
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

/**
 * GET /api/vapid-public-key
 * Returns the public VAPID key so the browser can subscribe to Web Push.
 *
 * Environment variables required in Vercel dashboard:
 *   VAPID_PUBLIC_KEY   — generate with: npx web-push generate-vapid-keys
 */
export async function GET(): Promise<Response> {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return Response.json({ ok: false, error: 'VAPID public key not configured' }, { status: 500 });
  }
  return Response.json({ ok: true, key });
}

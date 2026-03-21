// Cloudflare Pages Function — served at /config.js
// Reads SUPABASE_URL and SUPABASE_ANON_KEY from Cloudflare env vars (never exposed in static files)
// Set these in: Cloudflare Pages → your project → Settings → Environment variables

export async function onRequest(context) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = context.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      `window.DRMSA_CONFIG = { error: "Environment variables not set. Add SUPABASE_URL and SUPABASE_ANON_KEY in Cloudflare Pages → Settings → Environment variables." };`,
      { status: 200, headers: { 'Content-Type': 'application/javascript' } }
    );
  }

  return new Response(
    `window.DRMSA_CONFIG = { SUPABASE_URL: "${SUPABASE_URL}", SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}" };`,
    {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store', // never cache — always fresh from env
      }
    }
  );
}

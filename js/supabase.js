// js/supabase.js
// Waits for window.__cfgReady (set in index.html) before reading credentials.
// Production: config served by functions/config.js (Cloudflare Pages Function — never public)
// Local dev:  config read from config.local.js (gitignored)

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Wait for the config promise injected by index.html
if (window.__cfgReady) await window.__cfgReady;

const cfg = window.DRMSA_CONFIG;

if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
  document.body.innerHTML = `
    <div style="font-family:system-ui,sans-serif;padding:40px;max-width:560px;margin:60px auto;background:#161b22;border:1px solid #f85149;border-radius:10px;color:#e6edf3">
      <div style="font-size:20px;font-weight:800;color:#f85149;margin-bottom:12px">⚠ Config missing</div>
      <p style="color:#8b949e;line-height:1.8;margin-bottom:12px">
        <strong style="color:#e6edf3">Cloudflare Pages:</strong> Go to your project →
        Settings → Environment variables and add:
      </p>
      <pre style="background:#0d1117;padding:12px;border-radius:6px;font-size:13px;color:#58a6ff;margin-bottom:16px">SUPABASE_URL        = https://your-project.supabase.co
SUPABASE_ANON_KEY   = eyJhbGci...</pre>
      <p style="color:#8b949e;line-height:1.8">
        Then redeploy. The <code style="color:#3fb950">functions/config.js</code> file
        reads these securely on the server — they are never exposed in your repo or static files.
      </p>
      <p style="color:#8b949e;line-height:1.8;margin-top:12px">
        <strong style="color:#e6edf3">Local dev:</strong> Copy
        <code style="color:#58a6ff">config.local.example.js</code> →
        <code style="color:#58a6ff">config.local.js</code> and fill in your keys.
      </p>
    </div>`;
  throw new Error('DRMSA: Supabase credentials not found. Check environment variables.');
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, municipalities(name, code, district, ward_count)')
    .eq('id', user.id)
    .single();
  return profile;
}

export async function isOnboardingComplete(municipalityId) {
  const { data } = await supabase
    .from('municipalities')
    .select('onboarding_complete')
    .eq('id', municipalityId)
    .single();
  return data?.onboarding_complete === true;
}

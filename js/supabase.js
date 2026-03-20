// js/supabase.js
// Reads credentials from window.DRMSA_CONFIG, which is set in config.local.js
// That file is gitignored — your key never touches version control.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.DRMSA_CONFIG || {};

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  document.body.innerHTML = `
    <div style="font-family:monospace;padding:40px;max-width:540px;margin:60px auto;background:#161b22;border:1px solid #f85149;border-radius:10px;color:#e6edf3">
      <div style="font-size:22px;font-weight:800;color:#f85149;margin-bottom:12px">⚠ Config missing</div>
      <p style="color:#8b949e;line-height:1.7;margin-bottom:16px">DRMSA needs your Supabase credentials to start.</p>
      <ol style="color:#8b949e;line-height:2;padding-left:20px">
        <li>Copy <code style="color:#58a6ff">config.js</code> → <code style="color:#58a6ff">config.local.js</code></li>
        <li>Open <code style="color:#58a6ff">config.local.js</code></li>
        <li>Paste your Supabase <strong style="color:#e6edf3">Project URL</strong> and <strong style="color:#e6edf3">anon key</strong></li>
        <li>Reload the page</li>
      </ol>
      <p style="margin-top:16px;font-size:12px;color:#6e7681">Get your keys: Supabase → your project → Settings → API</p>
    </div>`;
  throw new Error('DRMSA: config.local.js not found or empty. See config.js for instructions.');
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
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

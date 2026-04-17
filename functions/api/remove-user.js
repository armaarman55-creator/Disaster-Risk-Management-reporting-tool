// Cloudflare Pages Function — served at /api/remove-user
// Removes a user from auth + user_profiles with municipality/role checks.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function readEnvValue(v) {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function getSupabaseEnv(env) {
  const supabaseUrl =
    readEnvValue(env.SUPABASE_URL) ||
    readEnvValue(env.PUBLIC_SUPABASE_URL) ||
    readEnvValue(env.VITE_SUPABASE_URL) ||
    '';

  const serviceKey =
    readEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) ||
    readEnvValue(env.SUPABASE_SERVICE_KEY) ||
    readEnvValue(env.SUPABASE_KEY) ||
    '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in Cloudflare env vars.');
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    serviceKey
  };
}

async function supabaseRequest(env, path, options = {}) {
  const { supabaseUrl, serviceKey } = getSupabaseEnv(env);
  return fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function getRequesterAuthUser(env, authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Missing bearer token.' };
  const { supabaseUrl, serviceKey } = getSupabaseEnv(env);
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) return { error: 'Invalid auth token.' };
  const user = await res.json();
  return { user };
}

async function getProfileById(env, id) {
  const res = await supabaseRequest(env, `/rest/v1/user_profiles?id=eq.${encodeURIComponent(id)}&select=id,full_name,role,status,municipality_id&limit=1`, { method: 'GET' });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body.target_user_id || '').trim();
    if (!targetUserId) return json({ error: 'target_user_id is required.' }, 400);

    const authHeader = request.headers.get('authorization') || '';
    const { user, error: authError } = await getRequesterAuthUser(env, authHeader);
    if (authError || !user?.id) return json({ error: authError || 'Not authenticated.' }, 401);

    if (user.id === targetUserId) {
      return json({ error: 'You cannot remove your own account.' }, 400);
    }

    const requester = await getProfileById(env, user.id);
    if (!requester) return json({ error: 'Requester profile not found.' }, 403);
    if (!['admin', 'disaster_officer'].includes(requester.role)) {
      return json({ error: 'Only admin/disaster_officer can remove users.' }, 403);
    }

    const targetProfile = await getProfileById(env, targetUserId);
    if (!targetProfile) return json({ error: 'Target user profile not found.' }, 404);

    if (requester.role !== 'admin' && targetProfile.municipality_id !== requester.municipality_id) {
      return json({ error: 'You can only remove users in your municipality.' }, 403);
    }

    const delAuth = await supabaseRequest(env, `/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' });
    if (!delAuth.ok) {
      const txt = await delAuth.text();
      return json({ error: txt || `Failed deleting auth user (${delAuth.status})` }, delAuth.status);
    }

    await supabaseRequest(env, `/rest/v1/user_profiles?id=eq.${encodeURIComponent(targetUserId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });

    return json({ ok: true, removed_user_id: targetUserId }, 200);
  } catch (e) {
    return json({ error: e?.message || 'Unexpected error' }, 500);
  }
}

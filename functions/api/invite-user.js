// Cloudflare Pages Function — served at /api/invite-user
// Sends Supabase auth invites server-side using the service role key.

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
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
}

async function getRequesterAuthUser(env, authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { error: 'Missing bearer token.' };
  }

  const { supabaseUrl, serviceKey } = getSupabaseEnv(env);
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const msg = await res.text();
    return { error: `Invalid auth token: ${msg || res.status}` };
  }

  const user = await res.json();
  return { user };
}

async function fetchProfileByFilter(env, filterQuery) {
  const q = `/rest/v1/user_profiles?${filterQuery}&select=id,role,municipality_id,full_name&limit=1`;
  const res = await supabaseRequest(env, q, { method: 'GET' });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function getUserProfile(env, authUser) {
  const userId = authUser?.id ? String(authUser.id).trim() : '';

  if (userId) {
    const byId = await fetchProfileByFilter(env, `id=eq.${encodeURIComponent(userId)}`);
    if (byId) return byId;

    // Backward compatibility for deployments where profile links to auth user id via auth_user_id.
    const byAuthUserId = await fetchProfileByFilter(env, `auth_user_id=eq.${encodeURIComponent(userId)}`);
    if (byAuthUserId) return byAuthUserId;
  }

  return null;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed. Use POST.' }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    const inviteRole = String(body.user_role || '').trim();
    const requestedMunicipalityId = String(body.municipality_id || '').trim() || null;

    const allowedInviteRoles = new Set(['admin', 'disaster_officer', 'planner', 'viewer']);
    if (!email || !fullName || !inviteRole) {
      return json({ error: 'email, full_name and user_role are required.' }, 400);
    }
    if (!allowedInviteRoles.has(inviteRole)) {
      return json({ error: 'Invalid user_role.' }, 400);
    }

    const authHeader = request.headers.get('authorization') || '';
    const { user, error: authError } = await getRequesterAuthUser(env, authHeader);
    if (authError || !user?.id) {
      return json({ error: authError || 'Not authenticated.' }, 401);
    }

    const requester = await getUserProfile(env, user);
    if (!requester) {
      return json({
        error: 'Requester profile not found. Ensure user_profiles has a row linked by id (or auth_user_id in legacy schemas).',
        requester_auth_id: user.id,
        requester_email: user.email || null
      }, 403);
    }
    if (!['admin', 'disaster_officer'].includes(requester.role)) {
      return json({ error: 'Only admin/disaster_officer can invite users.' }, 403);
    }

    const targetMunicipalityId =
      requester.role === 'admin'
        ? (requestedMunicipalityId || requester.municipality_id)
        : requester.municipality_id;

    if (!targetMunicipalityId) {
      return json({ error: 'No municipality scope available for invite.' }, 400);
    }
    if (requester.role !== 'admin' && requestedMunicipalityId && requestedMunicipalityId !== requester.municipality_id) {
      return json({ error: 'You can only invite users for your own municipality.' }, 403);
    }

    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : null;
    const payload = {
      email,
      data: {
        full_name: fullName,
        municipality_id: targetMunicipalityId,
        user_role: inviteRole,
        invited_by_admin: 'true'
      },
      ...(redirectTo ? { redirect_to: redirectTo } : {})
    };

    const inviteRes = await supabaseRequest(env, '/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!inviteRes.ok) {
      const txt = await inviteRes.text();
      return json({ error: txt || `Supabase invite failed (${inviteRes.status})` }, inviteRes.status);
    }

    const inviteData = await inviteRes.json().catch(() => ({}));
    const invitedUserId = inviteData?.user?.id || inviteData?.id || null;
    let passwordSetupEmailSent = false;
    if (invitedUserId) {
      await supabaseRequest(
        env,
        '/rest/v1/user_profiles?on_conflict=id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            id: invitedUserId,
            full_name: fullName,
            role: inviteRole,
            municipality_id: targetMunicipalityId,
            status: 'active'
          }])
        }
      );
    }

    const passwordSetupRes = await supabaseRequest(env, '/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({
        email,
        ...(redirectTo ? { redirect_to: redirectTo } : {})
      })
    });
    passwordSetupEmailSent = passwordSetupRes.ok;

    return json({
      ok: true,
      invited_email: email,
      municipality_id: targetMunicipalityId,
      user_role: inviteRole,
      password_setup_email_sent: passwordSetupEmailSent,
      invite: inviteData
    }, 200);
  } catch (e) {
    return json({ error: e?.message || 'Unexpected error' }, 500);
  }
}

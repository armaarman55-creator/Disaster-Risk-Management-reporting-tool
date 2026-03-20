# DRMSA — Disaster Risk Management SA

Open-source disaster risk management platform for South African municipalities and NGOs.  
Created by **Diswayne Maarman** · Licensed under **Apache 2.0**

---

## Deploy to Cloudflare Pages, Netlify, or Vercel

### Step 1 — Set environment variables in your hosting dashboard

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://abcxyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key |

**Cloudflare Pages:** Settings → Environment variables → Add variable  
**Netlify:** Site configuration → Environment variables → Add variable  
**Vercel:** Project settings → Environment variables → Add variable

### Step 2 — Set the build command

| Setting | Value |
|---------|-------|
| Build command | `node build.js` |
| Output / publish directory | `.` (the root folder) |
| Node.js version | 18 or higher |

That's it. Every deploy runs `node build.js`, which reads your env vars and writes `config.js` before the files are served.

---

## Local development

For local dev you don't run the build script. Instead:

```bash
cp config.local.example.js config.local.js
# Edit config.local.js and add your Supabase URL and key
# Then open index.html directly or use any local server:
npx serve .
```

`config.local.js` is in `.gitignore` and will never be committed.

---

## Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the 4 SQL files in order:
   - `sql/01_schema.sql` — all database tables
   - `sql/02_rls.sql` — row-level security (each municipality isolated)
   - `sql/03_auth_roles.sql` — roles, triggers, seed municipalities
   - `sql/04_hazard_library.sql` — 38 hazard types + mitigation library
3. Go to **Settings → API** and copy your Project URL and anon key

---

## Create your first admin user

1. Register an account through the app
2. In Supabase → **Table Editor → user_profiles**, find your row
3. Set `role = 'admin'` and `status = 'active'`

---

## File structure

```
drmsa/
  index.html            App shell + router
  manifest.json         PWA manifest
  sw.js                 Service worker (offline cache)
  build.js              Build script — writes config.js from env vars
  package.json          Defines "build" script for hosting platforms
  config.local.js       Local dev credentials (gitignored)
  .gitignore

  css/                  8 CSS files (main, auth, dashboard, community,
                        sitrep, mopup, share, onboarding)
  js/                   15 JS modules (app, auth, supabase, dashboard,
                        hvc, community, routes, sitrep, mopup,
                        stakeholders, share, svg-images, pwa, ...)
  icons/                favicon + PWA icons (SVG)
  sql/                  4 SQL files — paste into Supabase SQL Editor
```

---

## Disclaimer

DRMSA is an open-source disaster risk management tool intended for use by municipal disaster management centres, district municipalities, and registered NGOs. Information published through this platform is managed by authorised officials and is for awareness and informational purposes only.

Developed by Diswayne Maarman. Licensed under the Apache License, Version 2.0.

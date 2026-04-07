-- Persistent map data cache for municipal ward boundaries and place labels.
-- Purpose: reduce runtime dependency on ArcGIS/OSM availability in production.

create table if not exists public.municipal_ward_geojson_cache (
  id bigserial primary key,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  municipality_code text,
  source text not null default 'arcgis',
  source_layer text,
  ward_number integer,
  properties jsonb not null default '{}'::jsonb,
  geometry jsonb not null,
  source_hash text,
  synced_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, source, ward_number)
);

create index if not exists idx_municipal_ward_geojson_cache_muni
  on public.municipal_ward_geojson_cache (municipality_id, source, updated_at desc);

create index if not exists idx_municipal_ward_geojson_cache_expiry
  on public.municipal_ward_geojson_cache (expires_at);

create table if not exists public.municipal_place_labels_cache (
  id bigserial primary key,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  municipality_code text,
  source text not null default 'osm',
  label text not null,
  place_class text,
  importance numeric,
  lon double precision not null,
  lat double precision not null,
  tags jsonb not null default '{}'::jsonb,
  source_hash text,
  synced_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, source, label, lon, lat)
);

create index if not exists idx_municipal_place_labels_cache_muni
  on public.municipal_place_labels_cache (municipality_id, source, updated_at desc);

create index if not exists idx_municipal_place_labels_cache_expiry
  on public.municipal_place_labels_cache (expires_at);

create or replace function public.touch_map_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_municipal_ward_geojson_cache on public.municipal_ward_geojson_cache;
create trigger trg_touch_municipal_ward_geojson_cache
before update on public.municipal_ward_geojson_cache
for each row execute function public.touch_map_cache_updated_at();

drop trigger if exists trg_touch_municipal_place_labels_cache on public.municipal_place_labels_cache;
create trigger trg_touch_municipal_place_labels_cache
before update on public.municipal_place_labels_cache
for each row execute function public.touch_map_cache_updated_at();

-- Optional maintenance helper for scheduled cleanup of stale cache rows.
create or replace function public.prune_stale_map_cache()
returns void
language plpgsql
as $$
begin
  delete from public.municipal_ward_geojson_cache
  where expires_at is not null and expires_at < now();

  delete from public.municipal_place_labels_cache
  where expires_at is not null and expires_at < now();
end;
$$;

alter table public.municipal_ward_geojson_cache enable row level security;
alter table public.municipal_place_labels_cache enable row level security;

drop policy if exists municipal_ward_geojson_cache_select_authenticated on public.municipal_ward_geojson_cache;
create policy municipal_ward_geojson_cache_select_authenticated
on public.municipal_ward_geojson_cache
for select
to authenticated
using (true);

drop policy if exists municipal_ward_geojson_cache_write_authenticated on public.municipal_ward_geojson_cache;
create policy municipal_ward_geojson_cache_write_authenticated
on public.municipal_ward_geojson_cache
for all
to authenticated
using (true)
with check (true);

drop policy if exists municipal_place_labels_cache_select_authenticated on public.municipal_place_labels_cache;
create policy municipal_place_labels_cache_select_authenticated
on public.municipal_place_labels_cache
for select
to authenticated
using (true);

drop policy if exists municipal_place_labels_cache_write_authenticated on public.municipal_place_labels_cache;
create policy municipal_place_labels_cache_write_authenticated
on public.municipal_place_labels_cache
for all
to authenticated
using (true)
with check (true);

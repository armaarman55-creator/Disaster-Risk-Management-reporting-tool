-- Contingency plan type registry table
-- Run this in Supabase SQL editor (or your Postgres migration pipeline)

create table if not exists public.contingency_plan_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category text not null check (category in ('seasonal', 'hazard_specific', 'functional', 'event')),
  template_code text not null,
  seed_group text,
  active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contingency_plan_types_category
  on public.contingency_plan_types (category, active, display_order, name);

create or replace function public.touch_contingency_plan_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_contingency_plan_types_updated_at on public.contingency_plan_types;
create trigger trg_touch_contingency_plan_types_updated_at
before update on public.contingency_plan_types
for each row execute function public.touch_contingency_plan_types_updated_at();

alter table public.contingency_plan_types enable row level security;

-- Read access for signed-in users
drop policy if exists contingency_plan_types_select_authenticated on public.contingency_plan_types;
create policy contingency_plan_types_select_authenticated
on public.contingency_plan_types
for select
to authenticated
using (true);

-- Insert/update/delete should be managed by service role/admin scripts by default.

insert into public.contingency_plan_types (code, name, description, category, template_code, seed_group, active, display_order) values
  -- Hazard-specific
  ('flood', 'Flood Contingency Plan', 'Flooding events including riverine and flash floods', 'hazard_specific', 'tpl_flood_v1', 'flood', true, 10),
  ('wildfire', 'Wildfire / Veld Fire Plan', 'Veld and wildfire contingency preparedness and response', 'hazard_specific', 'tpl_wildfire_v1', null, true, 20),
  ('severe_weather', 'Severe Weather Plan', 'General severe weather response planning', 'hazard_specific', 'tpl_severe_weather_v1', null, true, 30),
  ('storm', 'Storm Plan', 'Storm and wind damage preparedness', 'hazard_specific', 'tpl_storm_v1', null, true, 40),
  ('drought', 'Drought Plan', 'Drought mitigation and response actions', 'hazard_specific', 'tpl_drought_v1', null, true, 50),
  ('water_shortage', 'Water Shortage Plan', 'Water scarcity and supply interruption planning', 'hazard_specific', 'tpl_water_shortage_v1', null, true, 60),
  ('electricity_disruption', 'Electricity Disruption Plan', 'Grid failure/load shedding contingency planning', 'hazard_specific', 'tpl_electricity_disruption_v1', null, true, 70),
  ('hazmat', 'Hazmat Plan', 'Hazardous materials incident contingency planning', 'hazard_specific', 'tpl_hazmat_v1', null, true, 80),
  ('landslide', 'Landslide Plan', 'Slope failure and landslide risk response', 'hazard_specific', 'tpl_landslide_v1', null, true, 90),
  ('coastal_storm', 'Coastal Storm Plan', 'Coastal surge and severe coastal weather response', 'hazard_specific', 'tpl_coastal_storm_v1', null, true, 100),

  -- Functional
  ('evacuation', 'Evacuation Contingency Plan', 'Evacuation planning and movement control', 'functional', 'tpl_evacuation_v1', 'evacuation', true, 110),
  ('shelter', 'Shelter Management Plan', 'Emergency shelter operations and management', 'functional', 'tpl_shelter_v1', null, true, 120),
  ('communication', 'Emergency Communication Plan', 'Risk communication and public messaging plan', 'functional', 'tpl_communication_v1', null, true, 130),
  ('logistics', 'Emergency Logistics Plan', 'Response logistics and supply chain planning', 'functional', 'tpl_logistics_v1', null, true, 140),
  ('damage_assessment', 'Damage Assessment Plan', 'Post-impact damage assessment procedures', 'functional', 'tpl_damage_assessment_v1', null, true, 150),
  ('public_health', 'Public Health Contingency Plan', 'Public health incident preparedness and response', 'functional', 'tpl_public_health_v1', null, true, 160),

  -- Event
  ('mass_gathering', 'Mass Gathering Plan', 'Planned mass-event risk and incident planning', 'event', 'tpl_mass_gathering_v1', null, true, 170),
  ('election', 'Election Operations Plan', 'Election period contingency and coordination planning', 'event', 'tpl_election_v1', null, true, 180),
  ('protest_unrest', 'Protest / Unrest Plan', 'Civil unrest contingency planning and coordination', 'event', 'tpl_protest_unrest_v1', null, true, 190),
  ('vip_visit', 'VIP Visit Plan', 'VIP visit event safety and operations planning', 'event', 'tpl_vip_visit_v1', null, true, 200),
  ('major_incident', 'Major Incident Plan', 'Complex major-incident cross-functional contingency', 'event', 'tpl_major_incident_v1', null, true, 210),

  -- Seasonal
  ('winter', 'Winter Seasonal Plan', 'Seasonal winter hazard preparedness', 'seasonal', 'tpl_winter_v1', 'winter', true, 220),
  ('summer', 'Summer Seasonal Plan', 'Seasonal summer hazard preparedness', 'seasonal', 'tpl_summer_v1', null, true, 230),
  ('festive_season', 'Festive Season Plan', 'Holiday period operations and incident readiness', 'seasonal', 'tpl_festive_season_v1', null, true, 240),
  ('fire_season', 'Fire Season Plan', 'Seasonal fire risk preparedness', 'seasonal', 'tpl_fire_season_v1', null, true, 250)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  template_code = excluded.template_code,
  seed_group = excluded.seed_group,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = now();

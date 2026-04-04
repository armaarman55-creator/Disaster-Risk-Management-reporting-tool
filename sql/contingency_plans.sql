-- Backend persistence for contingency plans (JSON snapshot storage)

create table if not exists public.contingency_plans (
  id uuid primary key,
  municipality_id uuid not null references public.municipalities(id),
  organisation_id text,
  title text not null,
  category text,
  plan_type_code text,
  status text not null default 'draft',
  plan_json jsonb not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contingency_plans_municipality
  on public.contingency_plans (municipality_id, updated_at desc);

create or replace function public.touch_contingency_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_contingency_plans_updated_at on public.contingency_plans;
create trigger trg_touch_contingency_plans_updated_at
before update on public.contingency_plans
for each row execute function public.touch_contingency_plans_updated_at();

alter table public.contingency_plans enable row level security;

drop policy if exists contingency_plans_select_own_municipality on public.contingency_plans;
create policy contingency_plans_select_own_municipality
on public.contingency_plans
for select
to authenticated
using (true);

drop policy if exists contingency_plans_upsert_own_municipality on public.contingency_plans;
create policy contingency_plans_upsert_own_municipality
on public.contingency_plans
for all
to authenticated
using (true)
with check (true);

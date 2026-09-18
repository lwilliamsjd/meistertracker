-- GR GT Concierge CRM — Supabase schema
-- Run this once in Supabase: Project -> SQL Editor -> New Query -> paste -> Run

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES  (one row per team member, mirrors auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user is added in Supabase Auth
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- MEISTERS  (the people being sold the car)
-- ============================================================
create table if not exists meisters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  dealership text,
  dealership_website text,
  city text,
  state text,
  zip text,
  status text not null default 'New' check (status in ('New','Contacted','Engaged','Sold','Not Interested')),
  profile_summary text,
  created_by uuid references auth.users(id),
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you already ran an earlier version of this schema, run this once to add
-- the new columns to an existing table instead of recreating it:
-- alter table meisters add column if not exists dealership_website text;
-- alter table meisters add column if not exists city text;
-- alter table meisters add column if not exists state text;
-- alter table meisters add column if not exists zip text;

create index if not exists meisters_name_idx on meisters (name);
create index if not exists meisters_dealership_idx on meisters (dealership);
create index if not exists meisters_status_idx on meisters (status);

-- keep updated_at current
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists meisters_set_updated_at on meisters;
create trigger meisters_set_updated_at
  before update on meisters
  for each row execute procedure set_updated_at();

-- ============================================================
-- INTERACTIONS  (notes / conversation log per Meister)
-- ============================================================
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  method text not null check (method in ('Phone','Text','Email','In Person','Other')),
  note text not null,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists interactions_meister_idx on interactions (meister_id);
create index if not exists interactions_created_idx on interactions (created_at desc);

-- ============================================================
-- GUESTS  (people this Meister has referred/sold a vehicle to)
-- ============================================================
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  guest_name text not null,
  vehicle_purchased text,
  purchase_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists guests_meister_idx on guests (meister_id);

alter table guests enable row level security;

drop policy if exists "guests_all_authenticated" on guests;
create policy "guests_all_authenticated" on guests for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- ROW LEVEL SECURITY
-- Internal team tool: any signed-in team member can read/write everything.
-- Access is controlled by who has a login (added by you in Supabase Auth),
-- not by row ownership.
-- ============================================================
alter table profiles enable row level security;
alter table meisters enable row level security;
alter table interactions enable row level security;

drop policy if exists "profiles_read_all" on profiles;
create policy "profiles_read_all" on profiles for select using (auth.role() = 'authenticated');

drop policy if exists "meisters_all_authenticated" on meisters;
create policy "meisters_all_authenticated" on meisters for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "interactions_all_authenticated" on interactions;
create policy "interactions_all_authenticated" on interactions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- REALTIME
-- Run this (or use the Database -> Publications UI) so every team
-- member's screen updates live when someone else adds or edits
-- something. Safe to re-run; errors if a table is already added.
-- ============================================================
alter publication supabase_realtime add table meisters;
alter publication supabase_realtime add table interactions;
alter publication supabase_realtime add table guests;

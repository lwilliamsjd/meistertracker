-- GR GT Concierge CRM — Supabase schema
-- Safe to run on a FRESH project. If you already have data, use the
-- migration block in README.md instead (it only adds what's missing).
-- Run in Supabase: Project -> SQL Editor -> New Query -> paste -> Run

create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES  (one row per team member, mirrors auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

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

-- Is the current user an admin? (security definer so it can read profiles
-- without tripping over profiles' own RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Lets a signed-in user rename themselves (and only themselves) without
-- being able to touch is_admin.
create or replace function public.set_display_name(new_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set full_name = trim(new_name)
  where id = auth.uid() and length(trim(new_name)) > 0;
$$;

-- ============================================================
-- MEISTERS
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
  concierge text check (concierge is null or concierge in ('Freddie','Logan')),
  job_title text,
  next_follow_up date, -- legacy; replaced by the follow_ups table
  profile_summary text,
  created_by uuid references auth.users(id),
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meisters_name_idx on meisters (name);
create index if not exists meisters_dealership_idx on meisters (dealership);
create index if not exists meisters_status_idx on meisters (status);
create index if not exists meisters_follow_up_idx on meisters (next_follow_up);

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
-- INTERACTIONS  (conversation log per Meister)
-- occurred_at = when the conversation happened (editable, can be backdated)
-- created_at  = when it was logged (fixed)
-- ============================================================
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  method text not null check (method in ('Phone','Text','Email','In Person','Other')),
  note text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_by_name text,
  edited_at timestamptz,
  edited_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists interactions_meister_idx on interactions (meister_id);
create index if not exists interactions_occurred_idx on interactions (occurred_at desc);

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

-- ============================================================
-- FOLLOW-UPS  (personal reminders, optionally tied to an activity)
-- ============================================================
create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  meister_id uuid not null references meisters(id) on delete cascade,
  interaction_id uuid references interactions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists follow_ups_user_due_idx on follow_ups (user_id, due_at);
create index if not exists follow_ups_meister_idx on follow_ups (meister_id);
create index if not exists follow_ups_interaction_idx on follow_ups (interaction_id);

-- ============================================================
-- COMMENTS  (replies on a logged activity)
-- ============================================================
create table if not exists interaction_comments (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions(id) on delete cascade,
  body text not null,
  created_by uuid references auth.users(id),
  created_by_name text,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists interaction_comments_interaction_idx on interaction_comments (interaction_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Any signed-in team member can read, add, and edit everything.
-- Only admins (profiles.is_admin = true) can DELETE.
-- ============================================================
alter table profiles enable row level security;
alter table meisters enable row level security;
alter table interactions enable row level security;
alter table guests enable row level security;
alter table follow_ups enable row level security;
alter table interaction_comments enable row level security;

-- profiles: everyone signed in can read the team list; edits go through set_display_name()
drop policy if exists "profiles_read_all" on profiles;
create policy "profiles_read_all" on profiles for select using (auth.role() = 'authenticated');

-- meisters
drop policy if exists "meisters_all_authenticated" on meisters;
drop policy if exists "meisters_select" on meisters;
drop policy if exists "meisters_insert" on meisters;
drop policy if exists "meisters_update" on meisters;
drop policy if exists "meisters_delete_admin" on meisters;
create policy "meisters_select" on meisters for select using (auth.role() = 'authenticated');
create policy "meisters_insert" on meisters for insert with check (auth.role() = 'authenticated');
create policy "meisters_update" on meisters for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "meisters_delete_admin" on meisters for delete using (public.is_admin());

-- interactions
drop policy if exists "interactions_all_authenticated" on interactions;
drop policy if exists "interactions_select" on interactions;
drop policy if exists "interactions_insert" on interactions;
drop policy if exists "interactions_update" on interactions;
drop policy if exists "interactions_delete_admin" on interactions;
create policy "interactions_select" on interactions for select using (auth.role() = 'authenticated');
create policy "interactions_insert" on interactions for insert with check (auth.role() = 'authenticated');
create policy "interactions_update" on interactions for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "interactions_delete_admin" on interactions for delete using (public.is_admin());

-- guests
drop policy if exists "guests_all_authenticated" on guests;
drop policy if exists "guests_select" on guests;
drop policy if exists "guests_insert" on guests;
drop policy if exists "guests_update" on guests;
drop policy if exists "guests_delete_admin" on guests;
create policy "guests_select" on guests for select using (auth.role() = 'authenticated');
create policy "guests_insert" on guests for insert with check (auth.role() = 'authenticated');
create policy "guests_update" on guests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "guests_delete_admin" on guests for delete using (public.is_admin());

-- follow-ups: everyone can see them; only the owner (or an admin) can change or remove theirs
drop policy if exists "follow_ups_select" on follow_ups;
drop policy if exists "follow_ups_insert" on follow_ups;
drop policy if exists "follow_ups_update" on follow_ups;
drop policy if exists "follow_ups_delete" on follow_ups;
create policy "follow_ups_select" on follow_ups for select using (auth.role() = 'authenticated');
create policy "follow_ups_insert" on follow_ups for insert with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "follow_ups_update" on follow_ups for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "follow_ups_delete" on follow_ups for delete using (user_id = auth.uid() or public.is_admin());

-- comments: everyone can read/add; only the author (or admin) edits; only admins delete
drop policy if exists "comments_select" on interaction_comments;
drop policy if exists "comments_insert" on interaction_comments;
drop policy if exists "comments_update" on interaction_comments;
drop policy if exists "comments_delete_admin" on interaction_comments;
create policy "comments_select" on interaction_comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on interaction_comments for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());
create policy "comments_update" on interaction_comments for update using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "comments_delete_admin" on interaction_comments for delete using (public.is_admin());

-- ============================================================
-- REALTIME  (wrapped so re-running never errors with "already member")
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table follow_ups;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table interaction_comments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table meisters;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table interactions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table guests;
exception when duplicate_object then null; end $$;

-- ============================================================
-- MAKE YOURSELF ADMIN  (run once, swap in your login email)
-- ============================================================
-- update profiles set is_admin = true where email = 'you@example.com';

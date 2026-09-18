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
  concierge text check (concierge is null or concierge in ('Freddie','Logan')), -- which Concierge this login represents
  notify_comments boolean not null default true,
  notify_activity boolean not null default true,
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

-- Lets a signed-in user change their own notification preferences.
create or replace function public.set_notification_prefs(p_comments boolean, p_activity boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set notify_comments = coalesce(p_comments, notify_comments),
      notify_activity = coalesce(p_activity, notify_activity)
  where id = auth.uid();
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
-- QUESTION CATEGORIES  (inbound question types, for client reporting)
-- ============================================================
create table if not exists question_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into question_categories (name, sort_order) values
  ('Allocation', 10), ('PMA', 20), ('Delivery', 30), ('Build Options', 40), ('Guest Engagement', 50), ('Events', 60)
on conflict (name) do nothing;

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
  category_id uuid references question_categories(id) on delete set null, -- optional question type
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_by_name text,
  edited_at timestamptz,
  edited_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists interactions_meister_idx on interactions (meister_id);
create index if not exists interactions_occurred_idx on interactions (occurred_at desc);
create index if not exists interactions_category_idx on interactions (category_id);

-- Logged entries are locked, but the question type is reporting metadata:
-- this lets any signed-in user fix ONLY that field.
create or replace function public.set_interaction_category(p_id uuid, p_category_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.interactions set category_id = p_category_id
  where id = p_id and auth.role() = 'authenticated';
$$;

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
-- NOTIFICATIONS  (created by the database when someone else acts on a
-- Meister assigned to you; see notify_concierge() below)
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  kind text not null check (kind in ('comment','activity')),
  meister_id uuid references meisters(id) on delete cascade,
  interaction_id uuid references interactions(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, read_at, created_at desc);

create or replace function public.notify_concierge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meister_id uuid;
  v_kind text;
  v_interaction_id uuid;
  v_actor_id uuid;
  v_actor_name text;
  v_snippet text;
  v_method text;
  m record;
  target record;
  msg text;
begin
  if tg_table_name = 'interaction_comments' then
    v_kind := 'comment';
    v_interaction_id := new.interaction_id;
    v_actor_id := new.created_by;
    v_actor_name := new.created_by_name;
    v_snippet := new.body;
    select i.meister_id, i.method into v_meister_id, v_method from interactions i where i.id = new.interaction_id;
  else
    v_kind := 'activity';
    v_interaction_id := new.id;
    v_actor_id := new.created_by;
    v_actor_name := new.created_by_name;
    v_snippet := new.note;
    v_meister_id := new.meister_id;
    v_method := new.method;
  end if;

  if v_meister_id is null then return new; end if;
  select id, name, concierge into m from meisters where id = v_meister_id;
  if m.concierge is null then return new; end if;

  select id, notify_comments, notify_activity into target from profiles where concierge = m.concierge limit 1;
  if target.id is null or target.id = v_actor_id then return new; end if;
  if v_kind = 'comment' and not target.notify_comments then return new; end if;
  if v_kind = 'activity' and not target.notify_activity then return new; end if;

  v_snippet := left(regexp_replace(coalesce(v_snippet, ''), '\s+', ' ', 'g'), 120);
  if v_kind = 'comment' then
    msg := coalesce(v_actor_name, 'Someone') || ' commented on ' || m.name || ': ' || v_snippet;
  else
    msg := coalesce(v_actor_name, 'Someone') || ' logged ' ||
           case v_method when 'Other' then 'a note' when 'In Person' then 'an in-person visit' when 'Email' then 'an email' else 'a ' || lower(v_method) end ||
           ' with ' || m.name || ': ' || v_snippet;
  end if;

  insert into notifications (user_id, actor_id, actor_name, kind, meister_id, interaction_id, message)
  values (target.id, v_actor_id, v_actor_name, v_kind, v_meister_id, v_interaction_id, msg);
  return new;
end;
$$;

drop trigger if exists notify_on_comment on interaction_comments;
create trigger notify_on_comment after insert on interaction_comments
  for each row execute procedure public.notify_concierge();

drop trigger if exists notify_on_activity on interactions;
create trigger notify_on_activity after insert on interactions
  for each row execute procedure public.notify_concierge();

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
alter table notifications enable row level security;
alter table question_categories enable row level security;

-- question categories: everyone reads; only admins manage
drop policy if exists "categories_select" on question_categories;
drop policy if exists "categories_admin_insert" on question_categories;
drop policy if exists "categories_admin_update" on question_categories;
drop policy if exists "categories_admin_delete" on question_categories;
create policy "categories_select" on question_categories for select using (auth.role() = 'authenticated');
create policy "categories_admin_insert" on question_categories for insert with check (public.is_admin());
create policy "categories_admin_update" on question_categories for update using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_delete" on question_categories for delete using (public.is_admin());

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

-- interactions: logged entries are a record — they can be read, added, and
-- (by admins) deleted, but never edited. Add context as a comment instead.
drop policy if exists "interactions_all_authenticated" on interactions;
drop policy if exists "interactions_select" on interactions;
drop policy if exists "interactions_insert" on interactions;
drop policy if exists "interactions_update" on interactions;
drop policy if exists "interactions_delete_admin" on interactions;
create policy "interactions_select" on interactions for select using (auth.role() = 'authenticated');
create policy "interactions_insert" on interactions for insert with check (auth.role() = 'authenticated');
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

-- notifications: private to the person they're for. Only the database creates them.
drop policy if exists "notifications_select_own" on notifications;
drop policy if exists "notifications_update_own" on notifications;
drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_own" on notifications for delete using (user_id = auth.uid());

-- ============================================================
-- REALTIME  (wrapped so re-running never errors with "already member")
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table question_categories;
exception when duplicate_object then null; end $$;

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
-- MAKE YOURSELF ADMIN + LINK LOGINS TO CONCIERGE NAMES  (run once)
-- The concierge link is what routes notifications: when someone acts on a
-- Meister assigned to "Logan", the profile with concierge = 'Logan' is notified.
-- ============================================================
-- update profiles set is_admin = true where email = 'lwilliams@jacksondawson.com';
-- update profiles set concierge = 'Logan'   where email = 'lwilliams@jacksondawson.com';
-- update profiles set concierge = 'Freddie' where email = 'ftinkler@jacksondawson.com';

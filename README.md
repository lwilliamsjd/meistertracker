# GR GT Concierge CRM

A private CRM for tracking Meister conversations (phone, text, email) during the GR GT concierge program. Runs as a static site on GitHub Pages with a Supabase database behind it, so the whole team can use it at once from different machines and see each other's updates live.

## What it does

**Meisters dashboard**
- Status counts across the top (Total, New, Contacted, Engaged, Sold, Not Interested, Overdue). Click one to filter.
- Search by name, dealership, city, phone, email, or concierge. Filter by status and by concierge (Freddie / Logan / Unassigned).
- Sortable columns. "Last Contact" is the most recent logged conversation, separate from "Updated" (profile edits).
- "My Follow-Up" column shows your own next follow-up for each Meister, flagged Overdue (red) or Today (amber).

**Meister page**
- Left card: avatar, job title, dealership, status, assigned concierge, Call / Text / Email / Note shortcuts, your next follow-up, and contact details. The shortcuts only open the log box; nothing dials, texts, or emails.
- **Activity tab**: every logged conversation grouped by month with real timestamps. Filter by method. Log with a date/time (defaults to now, can be backdated). Edit any note; edits are marked.
  - **Follow-ups**: tick "Set a follow-up reminder" while logging (or use the Follow-up button) to create a titled reminder with a date and time. Each one has an **Outlook** button that opens a pre-filled Outlook 365 event, plus an .ics download for desktop Outlook. Mark done, edit, or delete your own.
  - **Comments**: reply under any logged activity. Teammates can add what they know; authors can edit their own comments.
  - Logged entries themselves can't be edited (the database refuses it, not just the button). If something needs adding, add a comment. Admins can delete an entry after a confirmation.
  - Completed follow-ups stay in the feed as their own entry ("Follow-up · completed by …"), and can be undone from there.
- **Guests tab**: people this Meister referred or sold a vehicle to, with vehicle, purchase date, and notes. Editable.
- **Edit Profile tab**: name, job title, status, concierge, contact details, address, dealership website. Phone auto-formats to (xxx) xxx-xxxx.

**Activity Log**: team-wide feed of every conversation, grouped by day, with comment counts. Filter by team member, method, or search.

**Question types**: every log box has an optional "Question type" dropdown (Allocation, PMA, Delivery, Build Options, Guest Engagement, Events — admins can add, rename, retire, or remove types on the Account page). Each entry shows its type as a chip you can change later if it was wrong. The Excel export gets a "Question Types" summary sheet and a column on Interactions.

**Analytics** (nav tab): a dashboard over a date range (7/30/90 days, this month, last month, YTD, all time, custom) and optional concierge filter. KPI tiles (conversations, Meisters contacted, vehicles sold, follow-ups due this week); activity over time (daily/weekly/monthly bars); interactions by type (donut); activity by concierge (stacked by method); question types; Meisters by status; vehicles sold per month (line, from guest purchases); most engaged Meisters; and upcoming follow-up counters (overdue / this week / next week / this month / next month, with per-concierge splits). Every number, bar, slice, and row opens a slide-out drawer listing exactly the items behind it, with a CSV download. The question-type drawer also shows who's asking, who logged it, method mix, an 8-week trend, and every note, and lets you assign a type to untyped entries.

**Notifications**: bell icon by your name. When a teammate comments on or logs activity for a Meister assigned to you, you get a notification here and a red dot on that Meister in the list. Opening the Meister clears it. Each person picks what triggers a notification on their Account page. Routing works by linking each login to a Concierge name (see setup).

**Follow-Ups**: your own pending reminders across every Meister, grouped Overdue / Today / Tomorrow / This week / Later, with a badge in the nav for anything due today or overdue. Completed ones are one click away.

**Account**: change your own password and display name inside the app (no email links, so it works behind the company filter). Shows the team list.

**Live sync**: a teammate's changes appear on your screen without refreshing, and never wipe out anything you're typing.

**Export to Excel**: five tabs (Meisters, Interactions, Comments, Follow-Ups, Guests) with real date cells that sort and filter in Excel.

**Permissions**: everyone signed in can view, add, and edit everything. Only admins can delete records. Exceptions that make sense for personal items: you can always edit/delete/complete your own follow-ups, and only you (or an admin) can edit your own comments. Admin is set per user in the database (see setup).

---

## If you're upgrading an existing database

Already running an earlier version? Run this in **SQL Editor** to add what's new. It's safe to re-run. Run it as **one paste** — it's written so nothing in it errors on a second run.

```sql
-- new columns
alter table profiles add column if not exists is_admin boolean not null default false;
alter table meisters add column if not exists dealership_website text;
alter table meisters add column if not exists city text;
alter table meisters add column if not exists state text;
alter table meisters add column if not exists zip text;
alter table meisters add column if not exists concierge text check (concierge is null or concierge in ('Freddie','Logan'));
alter table meisters add column if not exists next_follow_up date;
create index if not exists meisters_follow_up_idx on meisters (next_follow_up);

-- interactions: when it happened (backdatable) + edit tracking
alter table interactions add column if not exists occurred_at timestamptz;
update interactions set occurred_at = created_at where occurred_at is null;
alter table interactions alter column occurred_at set default now();
alter table interactions alter column occurred_at set not null;
alter table interactions add column if not exists edited_at timestamptz;
alter table interactions add column if not exists edited_by_name text;
create index if not exists interactions_occurred_idx on interactions (occurred_at desc);

-- guests table (no-op if it already exists)
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

-- helper functions
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.set_display_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set full_name = trim(new_name)
  where id = auth.uid() and length(trim(new_name)) > 0;
$$;

-- policies: everyone signed in can read/add/edit; only admins delete
drop policy if exists "meisters_all_authenticated" on meisters;
drop policy if exists "meisters_select" on meisters;
drop policy if exists "meisters_insert" on meisters;
drop policy if exists "meisters_update" on meisters;
drop policy if exists "meisters_delete_admin" on meisters;
create policy "meisters_select" on meisters for select using (auth.role() = 'authenticated');
create policy "meisters_insert" on meisters for insert with check (auth.role() = 'authenticated');
create policy "meisters_update" on meisters for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "meisters_delete_admin" on meisters for delete using (public.is_admin());

drop policy if exists "interactions_all_authenticated" on interactions;
drop policy if exists "interactions_select" on interactions;
drop policy if exists "interactions_insert" on interactions;
drop policy if exists "interactions_update" on interactions;
drop policy if exists "interactions_delete_admin" on interactions;
create policy "interactions_select" on interactions for select using (auth.role() = 'authenticated');
create policy "interactions_insert" on interactions for insert with check (auth.role() = 'authenticated');
create policy "interactions_update" on interactions for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "interactions_delete_admin" on interactions for delete using (public.is_admin());

drop policy if exists "guests_all_authenticated" on guests;
drop policy if exists "guests_select" on guests;
drop policy if exists "guests_insert" on guests;
drop policy if exists "guests_update" on guests;
drop policy if exists "guests_delete_admin" on guests;
create policy "guests_select" on guests for select using (auth.role() = 'authenticated');
create policy "guests_insert" on guests for insert with check (auth.role() = 'authenticated');
create policy "guests_update" on guests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "guests_delete_admin" on guests for delete using (public.is_admin());

-- job title
alter table meisters add column if not exists job_title text;

-- follow-ups (personal reminders)
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
alter table follow_ups enable row level security;
drop policy if exists "follow_ups_select" on follow_ups;
drop policy if exists "follow_ups_insert" on follow_ups;
drop policy if exists "follow_ups_update" on follow_ups;
drop policy if exists "follow_ups_delete" on follow_ups;
create policy "follow_ups_select" on follow_ups for select using (auth.role() = 'authenticated');
create policy "follow_ups_insert" on follow_ups for insert with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "follow_ups_update" on follow_ups for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "follow_ups_delete" on follow_ups for delete using (user_id = auth.uid() or public.is_admin());

-- comments on activities
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
alter table interaction_comments enable row level security;
drop policy if exists "comments_select" on interaction_comments;
drop policy if exists "comments_insert" on interaction_comments;
drop policy if exists "comments_update" on interaction_comments;
drop policy if exists "comments_delete_admin" on interaction_comments;
create policy "comments_select" on interaction_comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on interaction_comments for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());
create policy "comments_update" on interaction_comments for update using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "comments_delete_admin" on interaction_comments for delete using (public.is_admin());

-- convert any old "Next Follow-Up" dates into follow-up events (9:00 AM Central, owned by whoever created the Meister)
insert into follow_ups (meister_id, user_id, user_name, title, due_at)
select m.id, m.created_by, m.created_by_name, 'Follow up', (m.next_follow_up + time '09:00') at time zone 'America/Chicago'
from meisters m
where m.next_follow_up is not null and m.created_by is not null
  and not exists (select 1 from follow_ups f where f.meister_id = m.id and f.user_id = m.created_by and f.title = 'Follow up');
update meisters set next_follow_up = null where next_follow_up is not null;

-- logged entries can no longer be edited (comments are the way to add context)
drop policy if exists "interactions_update" on interactions;

-- notification routing + preferences on profiles
alter table profiles add column if not exists concierge text check (concierge is null or concierge in ('Freddie','Logan'));
alter table profiles add column if not exists notify_comments boolean not null default true;
alter table profiles add column if not exists notify_activity boolean not null default true;

create or replace function public.set_notification_prefs(p_comments boolean, p_activity boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles
  set notify_comments = coalesce(p_comments, notify_comments),
      notify_activity = coalesce(p_activity, notify_activity)
  where id = auth.uid();
$$;

-- notifications table
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
alter table notifications enable row level security;
drop policy if exists "notifications_select_own" on notifications;
drop policy if exists "notifications_update_own" on notifications;
drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_own" on notifications for delete using (user_id = auth.uid());

-- the trigger that creates notifications
create or replace function public.notify_concierge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meister_id uuid; v_kind text; v_interaction_id uuid; v_actor_id uuid; v_actor_name text;
  v_snippet text; v_method text; m record; target record; msg text;
begin
  if tg_table_name = 'interaction_comments' then
    v_kind := 'comment'; v_interaction_id := new.interaction_id; v_actor_id := new.created_by;
    v_actor_name := new.created_by_name; v_snippet := new.body;
    select i.meister_id, i.method into v_meister_id, v_method from interactions i where i.id = new.interaction_id;
  else
    v_kind := 'activity'; v_interaction_id := new.id; v_actor_id := new.created_by;
    v_actor_name := new.created_by_name; v_snippet := new.note; v_meister_id := new.meister_id; v_method := new.method;
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
create trigger notify_on_comment after insert on interaction_comments for each row execute procedure public.notify_concierge();
drop trigger if exists notify_on_activity on interactions;
create trigger notify_on_activity after insert on interactions for each row execute procedure public.notify_concierge();

-- link each login to its Concierge name (this is what routes notifications)
update profiles set concierge = 'Logan'   where email = 'lwilliams@jacksondawson.com';
update profiles set concierge = 'Freddie' where email = 'ftinkler@jacksondawson.com';

-- question types (for client reporting)
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
alter table interactions add column if not exists category_id uuid references question_categories(id) on delete set null;
create index if not exists interactions_category_idx on interactions (category_id);
alter table question_categories enable row level security;
drop policy if exists "categories_select" on question_categories;
drop policy if exists "categories_admin_insert" on question_categories;
drop policy if exists "categories_admin_update" on question_categories;
drop policy if exists "categories_admin_delete" on question_categories;
create policy "categories_select" on question_categories for select using (auth.role() = 'authenticated');
create policy "categories_admin_insert" on question_categories for insert with check (public.is_admin());
create policy "categories_admin_update" on question_categories for update using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_delete" on question_categories for delete using (public.is_admin());

-- lets anyone fix ONLY the question type on a locked entry
create or replace function public.set_interaction_category(p_id uuid, p_category_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.interactions set category_id = p_category_id
  where id = p_id and auth.role() = 'authenticated';
$$;

-- live sync (wrapped so "already member" never errors)
do $$ begin alter publication supabase_realtime add table question_categories; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table meisters; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table interactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table guests; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table follow_ups; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table interaction_comments; exception when duplicate_object then null; end $$;
```

Then make yourself admin (swap in your login email) — until you do, **nobody** can delete anything. (The block above already links lwilliams@ to Logan and ftinkler@ to Freddie for notifications; if a login uses a different email, adjust those two lines.)

```sql
update profiles set is_admin = true where email = 'you@example.com';
```

Log out and back in after that so the app picks up your admin flag. You'll see an **ADMIN** tag next to your name.

---

## Fresh setup (new Supabase project)

### 1. Create a Supabase project
Go to supabase.com, create a free project, and wait for it to finish provisioning.

### 2. Run the database schema
**SQL Editor → New Query**, paste in everything from `sql/schema.sql`, and run it. It creates the tables, security rules, helper functions, and live sync. Safe to re-run.

### 3. Add your team as logins
**Authentication → Users → Add User** for yourself and each team member. Pick "set password directly" (not "send invite") and hand them the password yourself — invite emails won't get through the company filter. Each person can change it later from the **Account** page in the app.

Display names: each person can set their own from the Account page. To set one from SQL instead:

```sql
update profiles set full_name = 'Jane Smith' where email = 'jane@example.com';
```

### 4. Make yourself admin and link logins to Concierge names
```sql
update profiles set is_admin = true where email = 'lwilliams@jacksondawson.com';
update profiles set concierge = 'Logan'   where email = 'lwilliams@jacksondawson.com';
update profiles set concierge = 'Freddie' where email = 'ftinkler@jacksondawson.com';
```
Only admins can delete Meisters, notes, and guests. Everyone else can add and edit. The concierge link is what routes notifications: activity on a Meister assigned to "Logan" notifies the login linked to Logan.

### 5. Connect the app to your Supabase project
Open `js/config.js` and fill in your **Project URL** and **anon / publishable key** from **Project Settings → API Keys**. The URL must look like `https://xxxxx.supabase.co` with nothing after it. The anon key is safe to publish in a public repo — access is controlled by requiring a login plus the row-level security rules, not by hiding this key.

### 6. Push to GitHub and turn on Pages
Push the folder to a GitHub repo, then **Settings → Pages → Deploy from a branch → main → / (root)**. GitHub gives you a URL like `https://yourname.github.io/repo-name/` — that's the link for the team. No build step; what's in the repo is what's live.

After every later change: `git add .` → `git commit -m "..."` → `git push`. If the site doesn't update, hard-refresh (Ctrl+Shift+R) or open it in an incognito window; it's usually browser cache.

---

## Notes on cost and limits

Supabase's free tier easily covers a small team on a program like this. GitHub Pages is free for a public repo, or for a private repo on plans that include Pages.

## Project structure

```
index.html              entry point
css/styles.css          dark theme (black / grey / red)
js/config.js            your Supabase URL + key (fill in during setup)
js/supabase-client.js   Supabase connection
js/api.js               all database read/write calls + realtime subscription
js/export.js            Excel export
js/app.js               router, pages, and UI
sql/schema.sql          database tables, security rules, functions, realtime
```

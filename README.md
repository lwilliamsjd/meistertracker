# GR GT Concierge CRM

A lightweight, private CRM for tracking Meister conversations (phone, text, email) during the GR GT concierge program. Runs as a static site on GitHub Pages with a Supabase database behind it, so your whole team can use it at once from different machines and see each other's updates live.

## What it does

- Meister list with search and status filter (New, Contacted, Engaged, Sold, Not Interested)
- Click a Meister to open their page: profile fields + a running log of conversations
- Every conversation note is tagged with method (Phone, Text, Email, In Person, Other), who logged it, and when
- Activity Log page shows everything your team has entered, newest first
- Live sync — when a teammate adds or edits something, your screen updates without refreshing
- Export to Excel button pulls everything into a two-tab .xlsx (Meisters, Interactions)
- Browser back/forward buttons work normally between pages

## One-time setup

### 1. Create a Supabase project
Go to supabase.com, create a free project, and wait for it to finish provisioning.

### 2. Run the database schema
In your Supabase project: **SQL Editor → New Query**, paste in everything from `sql/schema.sql`, and run it. This creates the tables, security rules, and the profile that gets created automatically whenever you add a team member.

### 3. Turn on live sync
Easiest way — run this in the SQL Editor (works regardless of which Supabase UI version you're on):

```sql
alter publication supabase_realtime add table meisters;
alter publication supabase_realtime add table interactions;
```

If it errors saying they're already in the publication, it's already on.

If you'd rather click through the UI instead, look for **Database → Publications** (some versions call it "Replication") — open `supabase_realtime` and toggle on `meisters` and `interactions`.

### 4. Add your team as logins
**Authentication → Users → Add User** for yourself and each team member. Use their real email and a temporary password, and have them change it after first login (Supabase doesn't have a built-in "change password" screen — the simplest path is you set a password for them and share it directly, or enable email invites in Authentication settings if you'd rather they set their own).

Set each user's **full_name** so the app shows their real name instead of their email: after creating the user, run this in the SQL Editor once per person (swap in their info):

```sql
update profiles set full_name = 'Jane Smith' where email = 'jane@example.com';
```

### 5. Connect the app to your Supabase project
Open `js/config.js` and fill in:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-public-key";
```

Both values are in Supabase under **Project Settings → API**. The anon key is safe to publish in a public GitHub repo — real access is controlled by requiring a login plus the row-level security rules in the schema, not by hiding this key.

### 6. Push to GitHub and turn on Pages
Push this whole folder to a GitHub repo, then in the repo: **Settings → Pages → Deploy from a branch → main → / (root)**. GitHub will give you a URL like `https://yourname.github.io/repo-name/` — that's the link to share with your team.

No build step is needed — it's plain HTML/CSS/JS, so what's in the repo is exactly what's live.

## Day to day use

- Bookmark your GitHub Pages URL and sign in with the login you were given
- **Meisters** tab is the main list — click a row to open that person
- Inside a Meister's page: **Profile** tab holds their info, **Conversations** tab is where you log each call/text/email
- **Activity Log** in the top nav shows the whole team's recent entries
- **Export to Excel** on the Meisters page downloads a spreadsheet with everything, any time you need to hand off data

## Notes on cost and limits

Supabase's free tier easily covers a 2-5 person team on a program like this (it supports up to 50,000 monthly active users and 500MB of database storage on the free plan — this app will use a tiny fraction of that). GitHub Pages hosting is free for a public repo, or free for a private repo on GitHub plans that include Pages.

## Project structure

```
index.html              entry point
css/styles.css          dark theme (black/grey/red)
js/config.js            your Supabase URL + key (fill in during setup)
js/supabase-client.js   Supabase connection
js/api.js               all database read/write calls + realtime subscription
js/export.js            Excel export
js/app.js               router, pages, and UI rendering
sql/schema.sql           database tables, security rules, realtime setup
```

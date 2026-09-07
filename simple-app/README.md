# Admin Dashboard — Simple Version (HTML/CSS/JS, no build tools)

This is the same admin/student system as before, rebuilt so there is
**nothing to install** on your computer — no Node.js, no npm, no command
line. Just plain HTML/CSS/JavaScript files and two small pieces of backend
code you paste into Supabase's own website.

**Real security is unchanged.** The database (Supabase/Postgres) is
identical to before — the same Row Level Security policies, the same
triggers enforcing exactly one admin and the 80-active-student cap. That
protection lives in the database, not in the frontend code, so simplifying
the frontend doesn't weaken it at all.

---

## What's different from the Next.js version

| | Before | Now |
|---|---|---|
| Frontend | Next.js/React, needs `npm install` + a build | Plain `.html`/`.css`/`.js` files — open and edit directly |
| Hosting | Vercel | GitHub Pages (a checkbox in repo settings) |
| Privileged actions (create student, reset password, delete) | Next.js API routes | Two Supabase Edge Functions, written in the Supabase website's own code editor |
| Database | Supabase (Postgres + Auth) | **Identical** — same 7 migration files |
| Creating the one admin account | A script you ran from a terminal | A function you click "Invoke" on in the Supabase website |

---

## Setup — every step happens in a website, no terminal

### 1. Create your Supabase project
Go to [supabase.com](https://supabase.com), sign up free, create a new
project. Save the database password it gives you somewhere safe.

### 2. Run the database migrations
In your Supabase project, open **SQL Editor** (left sidebar). Open each
file in `supabase/migrations/` in this order and paste-and-run it, one at
a time: `0001_profiles.sql`, `0002_business_rules.sql`,
`0003_profiles_rls.sql`, `0004_conversations.sql`, `0005_admin_helpers.sql`,
`0006_storage.sql`, `0007_activity_tracking.sql`. Click "Run" after each
paste before moving to the next file.

### 3. Create the two Edge Functions
In your Supabase project, open **Edge Functions** (left sidebar) →
**Deploy a new function** → **Via Editor**.
- Name it `admin-actions`, delete the placeholder code, and paste in the
  entire contents of `supabase/functions/admin-actions/index.ts`. Click
  Deploy.
- Repeat: name it `bootstrap-admin`, paste in
  `supabase/functions/bootstrap-admin/index.ts`. Click Deploy.

### 4. Create your admin (teacher) login
Still in **Edge Functions**, open `bootstrap-admin` → find the
"Test"/"Invoke" panel → set the request body to:
```json
{ "email": "you@example.com", "fullName": "Your Name" }
```
Click **Send** / **Invoke**. It replies with a one-time temporary
password — copy it now, it's shown only once.

### 5. Fill in your project's public keys
In Supabase, go to **Project Settings → API**. Copy the **Project URL**
and the **anon / public key**. Open `assets/config.js` in this project and
paste them in — it's the only file you need to edit. (This key is meant to
be public; it can't do anything on its own without the database's
permission rules agreeing.)

### 6. Put the project on GitHub and turn on Pages
Upload this whole folder to a GitHub repo (same drag-and-drop process as
before). Then in that repo: **Settings → Pages → Source: Deploy from a
branch → main → / (root)** → Save. GitHub gives you a URL like
`https://yourname.github.io/your-repo/`.

### 7. Sign in
Open that URL, go to `/login.html`, sign in with the admin email + the
temporary password from step 4. You'll be asked to set your own password
immediately, then land on the dashboard.

---

## How each requirement is still met

Nothing about *what* is enforced changed — only *how the code is
organized*:

- **80-student cap, single-admin rule, students can't self-promote**:
  still enforced by Postgres triggers in the (unchanged) migrations —
  works no matter what calls the database.
- **Students can't see each other / can't reach admin pages**: still
  enforced by Row Level Security on every table (`profiles`,
  `conversations`, `messages`) — a student's queries are physically
  restricted to their own rows by the database.
- **Nothing trusts the frontend for role**: `admin-actions` and
  `bootstrap-admin` verify the caller's identity from their real Supabase
  session token before doing anything privileged, exactly like the
  previous `requireAdmin()` — just running on Supabase's servers instead
  of Vercel's.
- **No password ever stored in plaintext**: unchanged — Supabase Auth
  hashes passwords; `profiles` still has no password column.
- **$0 architecture**: unchanged — Supabase free tier + GitHub Pages free
  tier, no paid SMS/email anywhere.

## Turning this into an app on a phone

Exactly the same as before — nothing about this changed:
- **Free, instant**: open the GitHub Pages URL on a phone → "Add to Home
  Screen" (Android Chrome or iPhone Safari). The `manifest.json` and icons
  are already set up for this.
- **Real installable Android `.apk`**: once deployed, paste your GitHub
  Pages URL into [pwabuilder.com](https://www.pwabuilder.com) → Package
  for Stores → Android.

## Changing the 80-student cap later
Same as before — one SQL statement in the Supabase SQL Editor:
```sql
update app_settings set value = 100 where key = 'max_active_students';
```

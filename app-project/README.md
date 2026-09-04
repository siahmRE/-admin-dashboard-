# Admin Dashboard — Teacher/Student User Management

A $0-infrastructure admin system built on **Next.js (App Router) + Supabase**.
One teacher/admin account controls access for up to **80 active students**,
enforced in the database — not just the UI.

---

## 1. Architecture

```
Browser (student or admin)
   │
   ├── Next.js Server Components / Route Handlers (Vercel free tier)
   │      - lib/supabase/server.ts   → user-scoped client (anon key, RLS applies)
   │      - lib/supabase/admin.ts    → service-role client (server-only, RLS bypassed,
   │                                    used ONLY inside /app/api/admin/** after
   │                                    requireAdmin() has verified the caller)
   │      - middleware.ts            → edge-level "must be signed in" gate on /admin/*
   │      - app/admin/layout.tsx     → real authorization gate: reads profiles.role
   │                                    from the DB, redirects non-admins
   │
   └── Supabase (free tier)
          - auth.users        → passwords, sessions (Supabase Auth; we never touch this table directly except via the Admin API)
          - public.profiles   → identity + role + status (source of truth for authorization)
          - public.conversations / public.messages → chat + audio history
          - Row Level Security on every table — the database enforces access
            control even if application code has a bug
          - Postgres triggers enforce the 80-student cap and single-admin rule
            no matter what calls the database
```

**No paid services anywhere.** No Twilio, no paid email API, no SMS. Student
accounts are created with a securely generated temporary password the admin
relays directly — no deliverability dependency at all.

---

## 2. How each requirement is implemented

### 1. Add Student
`components/AddStudentModal.tsx` → `POST /api/admin/students`
(`app/api/admin/students/route.ts`). Required: full name, email. Optional:
phone, student ID, notes. Server-side, in order:
1. `requireAdmin()` — verifies the caller via their session + DB role.
2. Email-uniqueness check (`profiles` email is a case-insensitive unique index).
3. Active-student-count check against the 80 cap (fast, friendly error).
4. Creates the `auth.users` row via the Admin API with a temporary password.
5. Creates the `profiles` row. If this fails (e.g. a race lost the cap
   check — see below), the orphaned auth user is rolled back.

### 2. Student Account Creation (free workflow)
No paid SMS/email API is used. `email_confirm: true` is set on creation, so
no confirmation email needs to be delivered at all. A cryptographically
random **temporary password** (`lib/utils/generate-password.ts`) is
generated server-side, shown to the admin **once** in the "Student added
successfully" dialog, and never stored in plaintext anywhere — Supabase
Auth stores only its hash. The student's `user_metadata.must_change_password`
flag forces them to `/set-password` on first login
(`app/set-password/page.tsx` → `POST /api/auth/set-password`).

*Why not Supabase's built-in invite email?* Supabase's free-tier SMTP is
rate-limited (a handful of emails/hour) and not designed for bulk onboarding
of up to 80 accounts at once. The temporary-password workflow is the
robust, $0-compatible default here. If you later add your own SMTP provider
with a free tier (e.g. Resend's free plan) you can swap in
`supabase.auth.admin.inviteUserByEmail()` without changing the data model.

### 3. Student List
`app/admin/students/page.tsx` + `components/StudentsClient.tsx`, backed by
`admin_list_students()` (a `SECURITY DEFINER` SQL function, gated by
`is_admin()`), returning name, email, phone, status, date added, last
activity, and unread-message count in one query. Actions per row: **Open
chat, View profile, Disable/Reactivate, Reset password, Delete** (delete
only appears once a student is disabled).

### 4. Active Student Limit (backend-enforced)
`supabase/migrations/0002_business_rules.sql` — `trg_enforce_active_student_limit`
runs `BEFORE INSERT OR UPDATE` on `profiles` and raises a Postgres exception
if creating/reactivating a student would exceed
`app_settings.max_active_students` (80). This fires **no matter what**
touches the table: the API route, the Supabase SQL editor, a future script,
or a second admin tab racing the first. The API route also does a
pre-check for a friendly error message, but the trigger is the real
guarantee. Disabled students are excluded from the count by definition
(`role='student' AND status='active'`).

### 5. Search
`admin_list_students(search)` matches name, email, or phone via `ILIKE`,
backed by trigram (`pg_trgm`) indexes for fast partial matches even at 80+
rows.

### 6. Student Status
`profiles.status` is `active` or `disabled` (DB `CHECK` constraint). A
disabled student:
- Is blocked from touching any real data — `is_active_student()` gates
  `messages` INSERT policies, so a disabled account cannot send messages
  even if they still hold a valid session.
- Is signed out and refused at `/login` and on every page load in
  `app/page.tsx` if their session somehow persists.
- Keeps 100% of their historical `profiles`/`conversations`/`messages` rows
  — disabling never deletes anything.
- Can be reactivated any time (subject to the 80-cap trigger).

### 7. Delete
Two distinct, separate actions, exactly as specified:
- **Disable** (`PATCH /api/admin/students/[id]`, `action: "disable"`) —
  reversible, default path.
- **Delete permanently** (`DELETE /api/admin/students/[id]`) — only callable
  once a student is already disabled, requires `{ confirm: true }` in the
  body, and the UI (`components/ConfirmDeleteDialog.tsx`) requires typing
  `DELETE` before that flag is even sent. The dialog explicitly warns that
  profile, conversations, messages, and audio files will be removed. Server
  deletes any Storage audio files for the student's conversation, then
  deletes the `auth.users` row, which cascades to `profiles` →
  `conversations` → `messages` via `ON DELETE CASCADE` foreign keys.

### 8. Admin Security
- **Single admin, enforced in the DB**: `trg_enforce_single_admin`
  (`0002_business_rules.sql`) raises an exception if a second `role='admin'`
  row is ever inserted or a student is promoted to admin. There is no UI
  path to create an admin at all — the only admin is created once via
  `scripts/create-admin.mjs`, which itself refuses to run if an admin
  already exists.
- **Students cannot escalate**: `trg_prevent_self_privilege_change` blocks
  any authenticated user from changing their own `role` or `status`, and
  RLS `profiles_insert`/`profiles_update`/`profiles_delete` policies require
  `is_admin()` for anything beyond a student editing their own contact
  info.
- **Students cannot see each other**: `profiles_select`,
  `conversations_select`, and `messages_select` policies all check
  `id = auth.uid()` / `student_id = auth.uid()` — a student's queries are
  physically restricted by Postgres to their own rows, regardless of what
  the frontend requests.
- **Nothing trusts the frontend for role**: every privileged API route
  calls `requireAdmin()`
  (`lib/auth/require-admin.ts`), which re-derives the caller's identity
  from their verified session (`supabase.auth.getUser()`, not a
  client-decoded JWT) and looks up their role from the database. No route
  ever reads a `role` field out of the request body.
- **Defense in depth**: even if an API route had a bug, RLS policies on
  every table are the last line of defense — a compromised or buggy server
  action still can't bypass Postgres-level authorization when it uses the
  anon-key client. Only the service-role client (used solely inside
  `requireAdmin()`-gated routes) bypasses RLS, by design, for the narrow
  set of operations RLS can't express (managing `auth.users`).

### 9. Admin Dashboard
`app/admin/page.tsx` — students `X / 80`, active, disabled, unread messages,
and a recent-activity feed, all from `admin_dashboard_stats()` (also
`is_admin()`-gated). Matches the requested layout: stat cards, a prominent
`+ Add Student`, and a link into the searchable student list.

### 10. Database
See `supabase/migrations/0001…0007`. `profiles` has exactly the requested
fields (`id, full_name, email, phone, role, status, created_at, updated_at,
last_activity_at`) plus `student_id`, `notes`, and `created_by` for
auditability. **No password column anywhere** — passwords live only in
Supabase Auth's own `auth.users` table, hashed, which our schema never
duplicates.

### 11. UX
`components/AddStudentModal.tsx` matches the requested simple form: name and
email up front, phone as a visible optional field, student ID/notes tucked
behind a "+ Add student ID or notes" toggle so the default form stays tiny.
On success: "Student added successfully" plus a one-time, copyable
email/temporary-password panel with plain instructions for the teacher.

### 12. $0 compatibility
- Hosting: Vercel free tier (Next.js).
- Database/Auth/Storage: Supabase free tier.
- No SMS, no paid email API, no third-party invite service anywhere in the
  code. The only outbound "invitation" is a temporary password the teacher
  copies and relays manually — zero marginal cost per student, whether
  you have 1 or 80.

---

## 3. Setup

1. **Create a Supabase project** (free tier).
2. **Run the migrations** in `supabase/migrations/` in order, either via
   `supabase db push` (Supabase CLI) or by pasting each file into the SQL
   Editor in order (0001 → 0007).
3. **Copy environment variables**: `cp .env.example .env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API in Supabase).
4. **Create the one admin account**:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   ADMIN_EMAIL=teacher@example.com \
   ADMIN_NAME="Ms. Rivera" \
   node scripts/create-admin.mjs
   ```
   This prints a one-time temporary password. Sign in with it — you'll be
   required to set your own password immediately.
5. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
6. Sign in at `/login` with your admin email — you'll land on `/admin`.

## 4. Changing the 80-student cap

Edit the single row in `app_settings`:
```sql
update app_settings set value = 100 where key = 'max_active_students';
```
No code changes needed — every enforcement point (`trg_enforce_active_student_limit`,
`admin_dashboard_stats()`) reads from this table.

## 5. What's intentionally out of scope here

This delivers the full admin/user-management system as specified. The
student-facing chat *experience* (voice recording UI, push notifications,
etc.) is stubbed at a minimal working level — `app/page.tsx` and the chat
panel inside `StudentProfileClient.tsx` share the same `conversations` /
`messages` tables and RLS policies, so building out the student chat UI is
additive, not a schema change.

## 6. Running it on a laptop and a phone

This is a **responsive web app**, not a native app-store app — that's what
keeps it $0 and lets one codebase serve both a desktop admin and a
student on their phone.

- **Laptop**: open the deployed URL (or `http://localhost:3000` while
  developing) in any browser.
- **Phone**: open the same URL in the phone's browser. The admin table
  switches to a stacked-card layout below the `sm` breakpoint, buttons and
  inputs are sized for touch, and the layout is fully responsive
  (`components/StudentsClient.tsx` renders a table on tablet/desktop and
  cards on phone from the same data).
- **"Install" on a phone home screen**: the app ships a
  `public/manifest.json` and Apple/standard PWA meta tags
  (`app/layout.tsx`), so from a phone browser's share/menu the person can
  choose "Add to Home Screen" and it opens full-screen with an app icon —
  no App Store / Play Store submission required. The two placeholder icons
  in `public/icon-192.png` and `public/icon-512.png` are simple generated
  marks; swap them for your own branding whenever you like.

If you actually need a native iOS/Android app (App Store listing, push
notifications, camera-level device access), that's a different, much
larger project — wrapping this same backend in something like Expo/React
Native or Capacitor is possible, but it isn't what's built here and isn't
required to reach "works on laptop and phone."

## 7. Deploying so it's reachable from a phone at all

Locally, `http://localhost:3000` only works from the laptop it's running
on. To open it from a phone, deploy it:

1. Push this project to a GitHub repo.
2. Import it into [Vercel](https://vercel.com) (free tier).
3. Add the three environment variables from `.env.example` in the Vercel
   project settings.
4. Deploy — Vercel gives you a `https://your-app.vercel.app` URL that
   works identically on a laptop browser and a phone browser.


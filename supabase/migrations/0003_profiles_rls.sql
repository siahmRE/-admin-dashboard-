-- ============================================================================
-- 0003_profiles_rls.sql
-- Row Level Security for public.profiles.
-- The frontend NEVER decides who is an admin — Postgres does, via is_admin(),
-- which reads the caller's own row (looked up by auth.uid(), which Supabase
-- Auth sets from the verified JWT — it cannot be spoofed by the client).
-- ============================================================================

alter table public.profiles enable row level security;

-- security definer + fixed search_path so this function can read profiles
-- regardless of the calling role's own RLS visibility, without being
-- hijackable via a malicious search_path.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.current_status()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select status from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- SELECT: admin sees everyone. A student sees only their own row.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    public.is_admin() or id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- INSERT: only the admin may create profile rows via the authenticated
-- client. In practice, student creation happens server-side with the
-- service-role key (see /app/api/admin/students), which bypasses RLS
-- entirely — this policy protects the direct-client path too.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- UPDATE: admin can update any row. A student may update only their own
-- row's contact info — role/status changes on your own row are blocked by
-- the prevent_self_privilege_change trigger regardless of this policy.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update on public.profiles;
create policy profiles_update
  on public.profiles
  for update
  to authenticated
  using (
    public.is_admin() or id = auth.uid()
  )
  with check (
    public.is_admin() or id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- DELETE: only admin. Even then, prefer the "disable" workflow; hard delete
-- is a deliberate, separate, confirmed action from the admin UI.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete
  on public.profiles
  for delete
  to authenticated
  using (
    public.is_admin()
  );

-- Students authenticate with email/password via Supabase Auth directly.
-- Login itself is gated on status in the app layer (see lib/supabase and
-- middleware) AND defense-in-depth here: a disabled student's JWT still
-- works for Supabase Auth (Auth doesn't know about "status"), but every
-- table they'd need to read/write is locked down by is_active_student()
-- below, so a disabled account is functionally locked out of all data.
create or replace function public.is_active_student()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'student'
      and status = 'active'
  );
$$;

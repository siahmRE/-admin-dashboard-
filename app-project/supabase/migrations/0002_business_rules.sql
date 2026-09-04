-- ============================================================================
-- 0002_business_rules.sql
-- Hard constraints that MUST hold no matter what calls the database:
--   1. Exactly one admin account, ever.
--   2. At most MAX_ACTIVE_STUDENTS (80) students with status = 'active'.
--   3. A student can never change their own role or status.
-- These are enforced with triggers so no client (frontend, API route, or a
-- future bug) can bypass them by talking to Postgres directly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config: single source of truth for the active-student cap.
-- Stored in a tiny settings table so it can be inspected/changed by a DBA
-- without editing trigger code (still requires a migration to change).
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value int not null
);

insert into public.app_settings (key, value)
values ('max_active_students', 80)
on conflict (key) do nothing;

create or replace function public.max_active_students()
returns int
language sql
stable
as $$
  select value from public.app_settings where key = 'max_active_students';
$$;

-- ---------------------------------------------------------------------------
-- Rule 1: exactly one admin account.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_single_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  if new.role = 'admin' then
    select count(*) into admin_count
    from public.profiles
    where role = 'admin'
      and id <> new.id;

    if admin_count > 0 then
      raise exception 'ADMIN_LIMIT_REACHED: only one admin account is allowed'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_single_admin on public.profiles;
create trigger trg_enforce_single_admin
  before insert or update of role on public.profiles
  for each row
  execute function public.enforce_single_admin();

-- ---------------------------------------------------------------------------
-- Rule 2: at most N active students. Enforced server-side (not just UI).
-- Disabled students do not count. Admin rows never count.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_active_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
  cap int := public.max_active_students();
begin
  if new.role = 'student' and new.status = 'active' then
    select count(*) into active_count
    from public.profiles
    where role = 'student'
      and status = 'active'
      and id <> new.id;

    if active_count >= cap then
      raise exception 'ACTIVE_STUDENT_LIMIT_REACHED: maximum of % active students reached', cap
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_active_student_limit on public.profiles;
create trigger trg_enforce_active_student_limit
  before insert or update of status, role on public.profiles
  for each row
  execute function public.enforce_active_student_limit();

-- ---------------------------------------------------------------------------
-- Rule 3: a student can never change their own role or status.
-- Admin (checked via is_admin(), defined in 0003) is exempt.
-- This is a defense-in-depth backstop behind RLS.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_self_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role / server-side calls run as postgres role and bypass this;
  -- this trigger specifically guards direct authenticated-user writes.
  if auth.uid() is not null and auth.uid() = new.id then
    if new.role is distinct from old.role then
      raise exception 'FORBIDDEN: you cannot change your own role'
        using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      raise exception 'FORBIDDEN: you cannot change your own status'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_privilege_change on public.profiles;
create trigger trg_prevent_self_privilege_change
  before update on public.profiles
  for each row
  execute function public.prevent_self_privilege_change();

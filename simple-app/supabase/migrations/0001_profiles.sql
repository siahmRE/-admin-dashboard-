-- ============================================================================
-- 0001_profiles.sql
-- Core identity table. One row per auth.users row (admin or student).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text not null check (char_length(trim(full_name)) > 0),
  email            text not null,
  phone            text,
  student_id       text,
  notes            text,
  role             text not null default 'student' check (role in ('admin', 'student')),
  status           text not null default 'active' check (status in ('active', 'disabled')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz
);

-- Email is the primary identity/auth method -> must be unique, case-insensitively.
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email));

-- Fast lookups for the admin dashboard.
create extension if not exists pg_trgm;

create index if not exists profiles_role_status_idx on public.profiles (role, status);
create index if not exists profiles_status_idx on public.profiles (status);

-- Search by name / email / phone (trigram indexes power ILIKE '%term%' search).
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);
create index if not exists profiles_phone_idx on public.profiles (phone);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

comment on table public.profiles is
  'One row per user (admin or student). Never store passwords here — that lives in auth.users, managed by Supabase Auth.';

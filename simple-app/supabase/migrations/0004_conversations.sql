-- ============================================================================
-- 0004_conversations.sql
-- Minimal chat/messages model backing:
--   - Admin dashboard "Unread messages" count
--   - Admin Students list "Open chat" action
--   - Preserved message/audio history when a student is disabled
-- One conversation per student (student <-> admin), created lazily.
-- ============================================================================

create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null unique references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete set null,
  sender_role     text not null check (sender_role in ('admin', 'student')),
  body            text,
  audio_url       text,          -- Supabase Storage path, if a voice message
  audio_duration_seconds int,
  read_at         timestamptz,   -- null = unread by the recipient
  created_at      timestamptz not null default now(),
  constraint messages_body_or_audio check (body is not null or audio_url is not null)
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- Keep conversations.updated_at fresh so the admin list can sort by
-- "last activity" cheaply.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row
  execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select
  on public.conversations
  for select
  to authenticated
  using (
    public.is_admin() or student_id = auth.uid()
  );

-- Only the admin creates conversations from the app layer today
-- (lazily, the first time a chat is opened).
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert
  on public.conversations
  for insert
  to authenticated
  with check (
    public.is_admin()
  );

drop policy if exists messages_select on public.messages;
create policy messages_select
  on public.messages
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = auth.uid()
    )
  );

-- A student may only send messages as themselves, into their own
-- conversation, and only while their account is active. The admin may
-- post into any conversation.
drop policy if exists messages_insert on public.messages;
create policy messages_insert
  on public.messages
  for insert
  to authenticated
  with check (
    (
      public.is_admin()
      and sender_role = 'admin'
      and sender_id = auth.uid()
    )
    or (
      public.is_active_student()
      and sender_role = 'student'
      and sender_id = auth.uid()
      and exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id
          and c.student_id = auth.uid()
      )
    )
  );

-- Marking messages read: admin on any conversation, student on their own.
drop policy if exists messages_update on public.messages;
create policy messages_update
  on public.messages
  for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = auth.uid()
    )
  );

-- Disabling a student does NOT delete conversations/messages — the
-- `on delete cascade` above only fires on an explicit profile deletion
-- (the admin's separate, confirmed "Delete permanently" action).

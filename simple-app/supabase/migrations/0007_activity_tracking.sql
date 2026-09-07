-- ============================================================================
-- 0007_activity_tracking.sql
-- Keeps profiles.last_activity_at up to date:
--   1. Automatically whenever a student sends a message.
--   2. Via a heartbeat RPC the student app can call on sign-in / page load.
-- ============================================================================

create or replace function public.touch_student_activity_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_role = 'student' then
    update public.profiles
      set last_activity_at = now()
      where id = new.sender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_student_activity on public.messages;
create trigger trg_touch_student_activity
  after insert on public.messages
  for each row
  execute function public.touch_student_activity_from_message();

-- Callable heartbeat: a signed-in student can only ever touch their own
-- row, enforced by using auth.uid() rather than an id parameter.
create or replace function public.record_my_activity()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_activity_at = now() where id = auth.uid();
$$;

grant execute on function public.record_my_activity() to authenticated;

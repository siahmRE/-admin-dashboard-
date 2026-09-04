-- ============================================================================
-- 0005_admin_helpers.sql
-- Server-side helpers for the Admin Dashboard. These are SQL functions
-- (not views) so they can be called with .rpc() and are covered by the
-- same is_admin() gate as everything else.
-- ============================================================================

create or replace function public.admin_dashboard_stats()
returns table (
  total_students int,
  active_students int,
  disabled_students int,
  max_active_students int,
  unread_messages int
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.profiles where role = 'student') as total_students,
    (select count(*) from public.profiles where role = 'student' and status = 'active') as active_students,
    (select count(*) from public.profiles where role = 'student' and status = 'disabled') as disabled_students,
    public.max_active_students() as max_active_students,
    (select count(*) from public.messages m
       join public.conversations c on c.id = m.conversation_id
       where m.sender_role = 'student' and m.read_at is null) as unread_messages
  where public.is_admin();
$$;

-- Students list with search + unread counts, in one round trip.
create or replace function public.admin_list_students(search text default null)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  student_id text,
  notes text,
  status text,
  created_at timestamptz,
  last_activity_at timestamptz,
  unread_count bigint,
  conversation_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.student_id,
    p.notes,
    p.status,
    p.created_at,
    p.last_activity_at,
    coalesce(count(m.id) filter (where m.read_at is null and m.sender_role = 'student'), 0) as unread_count,
    c.id as conversation_id
  from public.profiles p
  left join public.conversations c on c.student_id = p.id
  left join public.messages m on m.conversation_id = c.id
  where p.role = 'student'
    and public.is_admin()
    and (
      search is null
      or search = ''
      or p.full_name ilike '%' || search || '%'
      or p.email ilike '%' || search || '%'
      or p.phone ilike '%' || search || '%'
    )
  group by p.id, c.id
  order by p.created_at desc;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_students(text) to authenticated;

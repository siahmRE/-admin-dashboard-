-- ============================================================================
-- 0006_storage.sql
-- Storage bucket for voice messages ("audio_url" on public.messages).
-- Private bucket: nothing is publicly readable. Access goes through signed
-- URLs your app generates server-side, or through these storage policies
-- for direct client access, scoped the same way as the messages table.
-- File path convention: {conversation_id}/{message_id}.webm
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('audio-messages', 'audio-messages', false)
on conflict (id) do nothing;

drop policy if exists "audio_messages_select" on storage.objects;
create policy "audio_messages_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audio-messages'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.conversations c
        where c.student_id = auth.uid()
          and c.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "audio_messages_insert" on storage.objects;
create policy "audio_messages_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'audio-messages'
    and (
      public.is_admin()
      or (
        public.is_active_student()
        and exists (
          select 1
          from public.conversations c
          where c.student_id = auth.uid()
            and c.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

-- Deletion only via the admin's server-side (service role) delete flow when
-- a student is permanently removed — no direct client delete policy needed.

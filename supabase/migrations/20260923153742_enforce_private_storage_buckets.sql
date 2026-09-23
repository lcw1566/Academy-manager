-- Bucket configuration is part of the deployable schema. The original SQL
-- Editor history created these buckets, but the CLI baseline only retained
-- the storage.objects policies. Reassert the exact private settings so a new
-- environment cannot start with missing or accidentally public buckets.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'academy-drive',
    'academy-drive',
    false,
    52428800,
    null
  ),
  (
    'feedback-attachments',
    'feedback-attachments',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

-- Keep direct object access narrow even if a prior environment was configured
-- manually. Shared-drive members upload only after an authorized metadata row
-- exists; only academy owners can read objects directly. Other members receive
-- short-lived URLs from academy-drive-file after its current-membership check.
drop policy if exists "academy_drive objects insert active member" on storage.objects;
create policy "academy_drive objects insert active member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'academy-drive'
  and public.can_upload_academy_drive_object(name)
);

drop policy if exists "academy_drive objects select owner" on storage.objects;
create policy "academy_drive objects select owner"
on storage.objects for select to authenticated
using (
  bucket_id = 'academy-drive'
  and public.is_owner_of_academy_drive_object(name)
);

drop policy if exists "feedback attachments insert own" on storage.objects;
create policy "feedback attachments insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "feedback attachments select own" on storage.objects;
create policy "feedback attachments select own"
on storage.objects for select to authenticated
using (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "feedback attachments delete own" on storage.objects;
create policy "feedback attachments delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'feedback-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "feedback attachments select developer" on storage.objects;
create policy "feedback attachments select developer"
on storage.objects for select to authenticated
using (
  bucket_id = 'feedback-attachments'
  and public.is_current_app_developer()
);

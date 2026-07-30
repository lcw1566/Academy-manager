-- Seenit — 공유 드라이브 Edge Function 최소 service_role 권한
--
-- academy-drive-file은 사용자 JWT를 검증한 뒤 service_role로 비공개 파일
-- 메타데이터와 Storage object를 처리한다. 024는 authenticated에만 테이블
-- 권한을 부여했기 때문에 Edge Function의 SELECT/DELETE가 42501로 실패했다.

begin;

grant usage on schema public to service_role;

-- 활성 학원 멤버십 확인에 필요한 읽기 권한.
grant select on table public.academy_members to service_role;

-- signed URL 발급에는 SELECT, 휴지통 영구 삭제에는 DELETE가 필요하다.
-- INSERT/UPDATE는 Edge Function에서 사용하지 않으므로 부여하지 않는다.
grant select, delete on table public.academy_drive_files to service_role;

notify pgrst, 'reload schema';

commit;

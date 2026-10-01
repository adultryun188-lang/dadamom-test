-- =============================================================================
-- 0008_purge_after_server_only.sql  —  보관 기한을 클라이언트가 못 정하게
--
-- 0006 은 purge_after 에 기본값(90일)만 뒀고, insert 할 때 그 칸을 같이 보내는 것을
-- 막지 않았다. 즉 앱을 거치지 않고 REST 로 직접 넣으면 purge_after 를
-- 2099-12-31 로 적어 사실상 영구 보관할 수 있었다. 실측으로 확인했다
-- (일반 사용자가 purge_after='2026-09-01' 로 넣는 데 성공).
--
-- 보관 기한은 사업자가 지는 의무지 사용자가 고르는 값이 아니다.
-- 컬럼 단위 권한으로 그 칸을 아예 쓸 수 없게 만든다. 기본값만 들어간다.
-- (트리거보다 가볍고, 규칙이 권한 테이블에 그대로 드러나 감사하기 쉽다.)
--
-- 적용 순서: 0007 다음
-- 리허설: tests/0008_rehearsal.sql (begin ... rollback)
-- =============================================================================
begin;

revoke insert on public.benefit_applications_pii from authenticated;
grant insert (application_id, owner_id, contact, address)
  on public.benefit_applications_pii to authenticated;

-- select / delete 는 그대로 둔다 (본인 조회, 본인·검수자 삭제)
grant select, delete on public.benefit_applications_pii to authenticated;

comment on column public.benefit_applications_pii.purge_after is
  '보관 기한. 서버 기본값(90일)으로만 정해진다. 클라이언트는 이 칸에 쓸 수 없다.';

notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- begin;
-- grant insert on public.benefit_applications_pii to authenticated;
-- commit;

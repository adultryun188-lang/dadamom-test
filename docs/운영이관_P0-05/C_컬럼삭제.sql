-- ════════════════════════════════════════════════════════════════════
--  P0-05 단계 C — 남은 것 이전하고 컬럼 지우기
--
--  ⚠️ 단계 B(코드 배포)를 확인한 뒤에만 실행하세요.
--     코드가 배포되지 않은 상태에서 이걸 돌리면 체험단 신청이 전부 실패합니다.
--
--  ⚠️ 이 파일은 되돌리기 어려운 단계입니다. 컬럼을 지우면 그 안의 값이 사라집니다.
--     (PII 표로 이미 옮겨두었지만, 되돌리려면 컬럼을 다시 만들고 복사해야 합니다)
--
--  '아직_안옮겨진것' 이 0 이 아니면 commit 하지 말고 rollback 하세요.
--  그래서 중간에 멈출 수 있도록 commit 을 맨 아래 따로 두었습니다.
-- ════════════════════════════════════════════════════════════════════

begin;

-- A~B 사이에 들어온 신청분 재이전 (on conflict 라 여러 번 돌려도 안전)
insert into public.benefit_applications_pii (application_id, owner_id, contact, address)
select a.id, a.owner_id, a.contact, a.address
  from public.benefit_applications a
 where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
on conflict (application_id) do nothing;

-- 남은 게 없는지 확인 — 0 이어야 합니다
select count(*) as 아직_안옮겨진것
  from public.benefit_applications a
 where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
   and not exists (select 1 from public.benefit_applications_pii p where p.application_id = a.id);

-- ⬆️ 위 숫자가 0 이 아니면 여기서 rollback; 하고 보고하세요.
--    0 이면 아래를 이어서 실행합니다.

alter table public.benefit_applications drop column if exists contact;
alter table public.benefit_applications drop column if exists address;

commit;

-- ════════════════════════════════════════════════════════════════════
--  적용 후 확인 — 둘 다 0 이어야 합니다 (컬럼이 사라졌다는 뜻)
-- ════════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='contact') as contact컬럼,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='address') as address컬럼;

-- PII 표의 행수 — 사전점검 [2] 의 '옮길행' + (A~B 사이 신청분) 이어야 합니다
select count(*) as pii행수 from public.benefit_applications_pii;

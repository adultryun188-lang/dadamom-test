-- ════════════════════════════════════════════════════════════════════
--  P0-05 단계 C — 남은 것 이전하고 컬럼 지우기
--
--  ⚠️ 단계 B(코드 배포)를 확인한 뒤에만 실행하세요.
--     코드가 배포되지 않은 상태에서 돌리면 체험단 신청이 전부 실패합니다.
--
--  ⚠️ 되돌리기 어려운 단계입니다. 컬럼을 지우면 그 안의 값이 사라집니다.
--     (PII 표로 옮겨두었지만, 되돌리려면 컬럼을 다시 만들고 복사해야 합니다)
--
--  ── 2026-10-05 수정 (클라우드 세션) ──────────────────────────────────
--  이전 판은 "'아직_안옮겨진것' 이 0 이 아니면 rollback 하세요" 라고
--  사람에게 맡겼습니다. 그런데 Supabase SQL Editor 는 **맨 마지막 구문의
--  결과만** 보여줍니다. 파일을 통째로 붙여 실행하면 그 숫자는 화면에
--  나오지도 않고 commit 이 그냥 지나갑니다. 0011 리허설에서 표 3개 중
--  마지막 하나만 보였던 것과 같은 함정입니다.
--
--  그래서 사람이 보고 판단하는 대신 **SQL 이 스스로 멈추게** 바꿨습니다.
--  남은 행이 있으면 예외가 나고 트랜잭션 전체가 자동으로 취소됩니다.
--  컬럼은 지워지지 않습니다.
-- ════════════════════════════════════════════════════════════════════

begin;

-- 1) A~B 사이에 들어온 신청분 재이전 (on conflict 라 여러 번 돌려도 안전)
insert into public.benefit_applications_pii (application_id, owner_id, contact, address)
select a.id, a.owner_id, a.contact, a.address
  from public.benefit_applications a
 where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
on conflict (application_id) do nothing;

-- 2) 안전장치 — 안 옮겨진 게 하나라도 있으면 여기서 전부 취소된다
do $guard$
declare n integer;
begin
  select count(*) into n
    from public.benefit_applications a
   where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
     and not exists (select 1 from public.benefit_applications_pii p
                      where p.application_id = a.id);
  if n > 0 then
    raise exception
      '중단: 아직 PII 표로 옮겨지지 않은 신청이 %건 있습니다. 컬럼을 지우지 않았습니다.', n
      using errcode = '42501';
  end if;
end $guard$;

-- 3) 본문에서 제거
alter table public.benefit_applications drop column if exists contact;
alter table public.benefit_applications drop column if exists address;

commit;

-- ════════════════════════════════════════════════════════════════════
--  적용 후 확인 — 위를 실행한 뒤 이 두 줄을 따로 실행하세요
--  (Supabase 는 마지막 구문 결과만 보여주므로 한 번에 붙이면 안 보입니다)
-- ════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='benefit_applications' and column_name='contact') as contact컬럼,
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='benefit_applications' and column_name='address') as address컬럼,
--   (select count(*) from public.benefit_applications_pii)                                          as pii행수;
-- → contact컬럼 0 · address컬럼 0 · pii행수 = 사전점검 '옮길행' + (A~B 사이 신청분)
--
-- 실패했다면 (빨간 오류 "중단: ...") 아무것도 바뀌지 않았습니다.
-- 그 건수를 알려주시면 왜 안 옮겨졌는지 보겠습니다.

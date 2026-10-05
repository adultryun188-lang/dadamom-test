-- ════════════════════════════════════════════════════════════════════
--  P0-05 사전 점검 — 읽기만 합니다. 바뀌는 것 없습니다.
--  이 파일을 먼저 돌리고 결과를 알려주세요.
-- ════════════════════════════════════════════════════════════════════

-- [1] 0006 의 삭제 정책이 쓰는 is_admin() 이 운영에 있나 — 기대: 1
--     0 이면 멈춥니다.
select count(*) as is_admin함수
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'is_admin';

-- [2] 옮길 데이터가 얼마나 되나 — '옮길행' 숫자를 적어두세요 (단계 A·C 에서 대조)
select count(*) as 신청전체,
       count(*) filter (where coalesce(contact,'') <> '' or coalesce(address,'') <> '') as 옮길행
  from public.benefit_applications;

-- [3] 이미 있으면 안 되는 것들 — 기대: 전부 0
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='consent_records')          as consent_records,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='benefit_applications_pii') as pii표,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='pii_access_log')           as 열람기록;

-- [4] (추가) 0006 이 기대하는 컬럼이 운영에 있나 — 기대: 넷 다 1
--     저장소의 0001 은 재구성한 기준선이라 운영과 다를 수 있어서 직접 봅니다.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='contact')  as contact,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='address')   as address,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='owner_id')  as owner_id,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='trial_key') as trial_key;

-- [5] (추가) 최근 백업이 있는지는 SQL 로 못 봅니다.
--     Supabase → Database → Backups 를 눈으로 확인해 주세요.
--     이번 건은 단계 C 에서 컬럼을 지웁니다 — P0-04 와 달리 데이터가 사라집니다.

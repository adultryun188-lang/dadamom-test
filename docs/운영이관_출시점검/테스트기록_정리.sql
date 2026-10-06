-- 운영 Supabase(hjqchbpxwviengdzvado) SQL Editor 에서 실행
-- 체험단 테스트 신청 기록 정리. 체험단 목록(a/b/c)은 앱에서 빠졌다.
-- 배송 정보(benefit_applications_pii)는 FK ON DELETE CASCADE 로 함께 지워진다.
begin;
do $g$
declare n int;
begin
  select count(*) into n from public.benefit_applications where trial_key not in ('a','b','c');
  if n > 0 then raise exception '테스트가 아닌 신청 %건이 있어요. 중단합니다.', n; end if;
end $g$;
delete from public.benefit_applications where trial_key in ('a','b','c');
delete from public.consent_records where kind in ('trial_shipping','trial_brand_use');
commit;
select (select count(*) from public.benefit_applications) as 남은신청,
       (select count(*) from public.benefit_applications_pii) as 남은배송정보,
       (select count(*) from public.consent_records where kind like 'trial_%') as 남은체험단동의;

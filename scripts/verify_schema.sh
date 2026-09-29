#!/usr/bin/env bash
# 테스트 DB 가 baseline 과 같은 모양인지 확인할 때 쓰는 SQL 을 출력한다.
# Supabase SQL Editor 에 붙여넣어 실행한다.
cat <<'SQL'
do $$ declare s text; f text; b text; begin
  select string_agg(t.tablename || '[' ||
    (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename)::text || ']',
    ', ' order by t.tablename)
  into s from pg_tables t where t.schemaname='public';
  select string_agg(p.proname, ', ' order by p.proname) into f
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
  select string_agg(id || '(public=' || public::text || ')', ', ' order by id) into b from storage.buckets;
  raise exception E'TABLES: %\n\nFUNCS: %\n\nBUCKETS: %', s, f, b;
end $$;
SQL

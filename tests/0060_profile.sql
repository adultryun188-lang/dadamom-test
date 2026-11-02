-- 0060 임신↔육아 한 달 제한·생년월일 검사 (테스트 DB 전용, 끝에 일부러 오류를 내서 전부 되돌린다)
do $$
declare u uuid := '33333333-3333-3333-3333-333333333333'; out text := ''; got text; v timestamptz;
begin
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set kid_type = 'pregnant', kid_type_changed_at = null where id = u;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin update public.profiles set kid_type = 'parenting', birth_date = '2026-10-20', birth_month = '2026-10' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  select kid_type_changed_at into v from public.profiles where id = u;
  out := out || (case when got = 'ok' and v is not null then 'PASS' else 'FAIL' end) || ' 첫 변경(임신→육아)·생년월일 저장(' || got || ') / ';
  begin update public.profiles set kid_type = 'pregnant' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  out := out || (case when got = 'KIDTYPE_COOLDOWN' then 'PASS' else 'FAIL' end) || ' 한 달 안 되돌리기 막힘(' || got || ') / ';
  begin update public.profiles set kid_type_changed_at = null where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  select kid_type_changed_at into v from public.profiles where id = u;
  out := out || (case when v is not null then 'PASS' else 'FAIL' end) || ' 변경일 직접 못 지움 / ';
  begin update public.profiles set region = '서울', birth_date = '2026-10-21' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  out := out || (case when got = 'ok' then 'PASS' else 'FAIL' end) || ' 단계 그대로 두고 생일만 고치기 됨(' || got || ')';
  raise exception 'RESULT %', out;
end $$;

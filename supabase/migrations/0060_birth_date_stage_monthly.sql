-- 0060 (2026-11-02 사장님)
-- 1) 아이 생년월일을 일(날짜)까지: profiles.birth_date. 예전 birth_month(YYYY-MM)는 그대로 두고 화면이 함께 채운다.
-- 2) 임신 중 ↔ 육아 중(kid_type) 바꾸기도 한 달(30일)에 한 번. 처음 정할 때는 기다리지 않음, 운영자 예외.
--    0058 guard_profile_nickname 에 함께 넣는다(트리거 하나).
begin;

alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists kid_type_changed_at timestamptz;
alter table public.profiles drop constraint if exists pf_birth_date_range;
alter table public.profiles add constraint pf_birth_date_range check (birth_date is null or birth_date between date '2000-01-01' and date '2100-01-01') not valid;

create or replace function public.guard_profile_nickname()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_ok timestamptz;
begin
  if coalesce(auth.role(), '') = 'authenticated' and not coalesce(public.is_admin(), false) then
    if public._reserved_name(new.nickname)
       and (tg_op = 'INSERT' or new.nickname is distinct from old.nickname) then
      raise exception 'RESERVED_NAME' using errcode = '22023', hint = '운영자·관리자·다다맘 같은 이름은 쓸 수 없어요';
    end if;
    if tg_op = 'UPDATE' then
      -- 닉네임 (0058)
      new.nickname_changed_at := old.nickname_changed_at;
      if coalesce(btrim(new.nickname), '') is distinct from coalesce(btrim(old.nickname), '')
         and coalesce(btrim(old.nickname), '') <> '' then
        next_ok := old.nickname_changed_at + interval '30 days';
        if old.nickname_changed_at is not null and now() < next_ok then
          raise exception 'NICKNAME_COOLDOWN' using errcode = 'P0001',
            hint = '닉네임은 한 달에 한 번 바꿀 수 있어요. ' || to_char(next_ok at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"') || '부터 바꿀 수 있어요';
        end if;
        new.nickname_changed_at := now();
      end if;
      -- 임신 중 ↔ 육아 중 (0060)
      new.kid_type_changed_at := old.kid_type_changed_at;
      if new.kid_type is distinct from old.kid_type and old.kid_type is not null then
        next_ok := old.kid_type_changed_at + interval '30 days';
        if old.kid_type_changed_at is not null and now() < next_ok then
          raise exception 'KIDTYPE_COOLDOWN' using errcode = 'P0001',
            hint = '임신 중·육아 중은 한 달에 한 번 바꿀 수 있어요. ' || to_char(next_ok at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"') || '부터 바꿀 수 있어요';
        end if;
        new.kid_type_changed_at := now();
      end if;
    else
      new.nickname_changed_at := null;
      new.kid_type_changed_at := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_nickname() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

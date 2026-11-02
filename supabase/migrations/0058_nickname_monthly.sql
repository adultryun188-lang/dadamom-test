-- 0058 닉네임(아이 애칭)은 한 달(30일)에 한 번만 바꿀 수 있다 (2026-11-02 사장님, 채팅에서 이름 바꿔 가며 문제 일으키는 것 막기)
--   처음 정할 때(비어 있다가 채울 때)는 기다리지 않는다. 운영자는 예외. 같은 이름끼리 겹치는 것은 괜찮다.
--   0055 guard_profile_nickname(운영자 사칭 이름 금지)에 덧붙인다.
begin;

alter table public.profiles add column if not exists nickname_changed_at timestamptz;

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
      new.nickname_changed_at := old.nickname_changed_at;   -- 이 칸은 서버만 고친다
      if coalesce(btrim(new.nickname), '') is distinct from coalesce(btrim(old.nickname), '')
         and coalesce(btrim(old.nickname), '') <> '' then
        next_ok := old.nickname_changed_at + interval '30 days';
        if old.nickname_changed_at is not null and now() < next_ok then
          raise exception 'NICKNAME_COOLDOWN' using errcode = 'P0001',
            hint = '닉네임은 한 달에 한 번 바꿀 수 있어요. ' || to_char(next_ok at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"') || '부터 바꿀 수 있어요';
        end if;
        new.nickname_changed_at := now();
      end if;
    else
      new.nickname_changed_at := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_nickname() from public, anon, authenticated;
drop trigger if exists profiles_guard_nickname on public.profiles;
create trigger profiles_guard_nickname before insert or update on public.profiles
  for each row execute function public.guard_profile_nickname();

notify pgrst, 'reload schema';
commit;

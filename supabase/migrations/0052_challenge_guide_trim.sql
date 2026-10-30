-- 0052 대회 안내 군더더기 빼기 (2026-10-30 사장님)
--   만삭: 앞·옆 상관없이 D라인 + 뱃지가 사진에 나오기만 하면 된다. "직접 찍은 사진만"은 필요 없는 말.
--   볼살: 같은 "직접 찍은 사진만" 문구 삭제. (원본 확인은 대회 규칙 전체에 이미 있다)
begin;
update public.challenges set
  description = '지금만 남길 수 있는 D라인! 배가 나온 모습과 임산부 뱃지를 한 사진에 담아 참여해요.',
  guide = array['배가 나온 모습과 임산부 뱃지가 한 사진에 나오면 돼요', '태명이나 주수를 한 줄로 남겨 주세요']
where id = 'bump';
update public.challenges set
  guide = array['볼살이 잘 보이는 아이 얼굴 사진 1장으로 참가해요', '몸무게·키 비교가 아니라 귀여움 자랑이에요']
where id = 'cheeks';
commit;

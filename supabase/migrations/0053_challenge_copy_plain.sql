-- 0053 챌린지 문구를 담백하게 (2026-10-31 사장님 "사족 다 빼고 담백하게")
-- 설명 = 무엇을 자랑하는지 한 줄, 안내 = 검수 기준만. 사진/영상 종류는 화면 위 칸이 이미 말해 준다.
begin;
update public.challenges set description = '아이가 혼자 걷는 순간을 자랑해요.',
  guide = array['아이 전신이 보이고, 어른 손 없이 혼자 걸어야 해요', '끊지 않고 한 번에 찍은 영상만 인정돼요'],
  placeholder = '예: 오늘 처음으로 세 발짝 걸었어요' where id = 'firststep';
update public.challenges set description = '처음 뒤집고 배밀이하는 순간을 자랑해요.',
  guide = array['아이 전신이 보이고, 어른 손 없이 혼자 움직여야 해요', '끊지 않고 한 번에 찍은 영상만 인정돼요'],
  placeholder = '예: 장난감까지 배밀이로 갔어요' where id = 'crawl';
update public.challenges set description = '포동포동한 볼살을 자랑해요.',
  guide = array['볼살이 잘 보이는 얼굴 사진이면 돼요'],
  placeholder = '예: 볼이 찹쌀떡 같아요' where id = 'cheeks';
update public.challenges set description = '지금만 남길 수 있는 D라인을 자랑해요.',
  guide = array['배가 나온 모습과 임산부 뱃지가 한 사진에 나오면 돼요', '태명이나 주수를 한 줄로 남겨 주세요'],
  placeholder = '예: 32주 콩콩이, 발차기가 세졌어요' where id = 'bump';
update public.challenges set description = '할로윈 코스튬을 입은 모습을 자랑해요.',
  guide = array['아이와 코스튬이 함께 보이면 돼요'],
  placeholder = '예: 호박 모자 쓰고 한참 웃었어요' where id = 'halloween';
update public.challenges set prize = '매달 투표 1위에게 배민·올리브영 상품권 2만 원' where id <> 'cheeks';
update public.challenges set prize = '매달 투표 1위에게 배민·올리브영 상품권 4만 원' where id = 'cheeks';
commit;

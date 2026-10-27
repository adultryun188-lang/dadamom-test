-- 0032: 챌린지마다 사진·영상 안내를 다르게
-- 움직임이 핵심인 챌린지(첫걸음·배밀이)는 영상을 권하고, 모습 자랑(할로윈·만삭·볼살)은 사진 한 장이면 충분하다고 안내한다.
-- 영상이 없어도 참가는 막지 않는다 (사진도 받음).
update public.challenges set guide = array[
  '혼자 걷는 모습을 30초 이내 영상으로 올려 주세요',
  '어른 손을 잡지 않고 한두 걸음이라도 혼자 내딛는 순간이면 돼요',
  '영상이 어려우면 사진도 받아요. 얼굴이 부담되면 발만 담아도 돼요'
] where id = 'firststep';

update public.challenges set guide = array[
  '뒤집거나 배밀이로 나아가는 모습을 30초 이내 영상으로 올려 주세요',
  '아직이면 엎드려 고개 드는 모습도 좋아요. 영상이 어려우면 사진도 받아요',
  '바닥이 안전한 곳에서 찍어 주세요'
] where id = 'crawl';

update public.challenges set guide = array[
  '코스튬·모자·소품을 걸친 사진 1장이면 충분해요 (짧은 영상도 좋아요)',
  '집에 있는 옷이나 담요로 꾸며도 좋아요',
  '얼굴이 부담되면 소품이나 뒷모습만 담아도 돼요'
] where id = 'halloween';

update public.challenges set guide = array[
  '배가 나온 모습 사진 1장이면 충분해요 (옷 위로 찍어도 좋아요)',
  '태명이나 주수를 한 줄로 남겨 주세요',
  '얼굴은 안 나와도 돼요. 손으로 하트를 만들어도 예뻐요'
] where id = 'bump';

update public.challenges set guide = array[
  '볼살이나 발바닥이 잘 보이는 사진 1장이면 충분해요',
  '몸무게·키 비교가 아니라 귀여움 자랑이에요',
  '얼굴이 부담되면 손·발만 담아도 돼요'
] where id = 'cheeks';

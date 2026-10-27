-- 0036: 챌린지 기준을 '판단할 수 있게' (사장님 2026-10-27)
-- 챌린지는 경품으로 사람을 모으는 홍보다. 불편은 줄이되, 판단이 안 되는 빠져나갈 구멍은 두지 않는다.
--   첫걸음·배밀이: 아이 전신 + 어른 손이 닿지 않음 + 끊지 않고 한 번에 찍은 영상 ('발만 찍어도 돼요' 삭제)
--   할로윈: 아이와 코스튬이 함께 보이게 ('소품이나 뒷모습만' 삭제)
--   볼살: 볼살이 보이는 얼굴 사진 (발바닥 삭제 — 기준이 둘이면 비교가 안 됨)
--   만삭: 직접 찍은 사진만
--   군더더기 '(사진은 받지 않아요)' 삭제 — 화면 위에 한 번 크게 안내한다.
begin;
update public.challenges set
  description = '아이가 혼자 걷는 모습을 1분 이내 영상과 짧은 메모로 참여해요. 10~24개월 아이가 대상이에요.',
  guide = array['아이가 혼자 걷는 모습을 1분 이내 영상으로 올려 주세요',
                '아이 전신이 보이게, 어른 손이 닿지 않은 채 걷는 장면이 담겨야 해요',
                '끊지 말고 한 번에 이어서 찍은 영상만 인정돼요']
 where id = 'firststep';
update public.challenges set
  description = '처음 뒤집은 날, 처음 앞으로 나아간 날! 그 순간을 1분 이내 영상으로 남겨요.',
  guide = array['뒤집거나 배밀이로 나아가는 모습을 1분 이내 영상으로 올려 주세요',
                '아이 전신이 보이게, 어른 손이 닿지 않은 채 혼자 움직이는 장면이 담겨야 해요',
                '안전한 바닥에서 끊지 말고 한 번에 이어서 찍어 주세요']
 where id = 'crawl';
update public.challenges set
  description = '우리 아이 할로윈 변신! 코스튬을 입은 사진 한 장으로 참여해요.',
  guide = array['코스튬·모자·소품을 걸친 아이 사진 1장으로 참가해요',
                '아이와 코스튬이 함께 잘 보이게 찍어 주세요',
                '집에 있는 옷이나 담요로 꾸며도 좋아요']
 where id = 'halloween';
update public.challenges set
  guide = array['배가 나온 모습 사진 1장으로 참가해요 (옷 위로 찍어도 좋아요)',
                '태명이나 주수를 한 줄로 남겨 주세요',
                '직접 찍은 사진만 인정돼요. 손으로 하트를 만들어도 예뻐요']
 where id = 'bump';
update public.challenges set
  description = '말랑말랑 볼살! 우리 아이 포동포동한 볼을 자랑해요.',
  guide = array['볼살이 잘 보이는 아이 얼굴 사진 1장으로 참가해요',
                '몸무게·키 비교가 아니라 귀여움 자랑이에요',
                '직접 찍은 사진만 인정돼요']
 where id = 'cheeks';
commit;
select id, media_rule, guide[2] as guide2 from public.challenges order by id;

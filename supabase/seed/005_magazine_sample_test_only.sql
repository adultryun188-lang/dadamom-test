-- 테스트 전용 (srxdtddrtnhtlbbviyvs). 운영에 넣지 않는다.
-- 매거진 화면 모양 확인용 예시. 실제 언론사·채널 이름을 빌리지 않고 출처를 '다다맘 (테스트 예시)'로 둔다.
insert into public.magazine_items (kind, title, summary, source_name, url, published_on, sort_order)
values
  ('news', '(테스트 예시) 첫만남이용권 신청 방법 정리', '출생 신고 뒤 받을 수 있는 지원을 한눈에 보는 예시 카드예요.', '다다맘 (테스트 예시)', 'https://dadamom.co.kr/community.html#/b/info', current_date - 1, 0),
  ('article', '(테스트 예시) 돌 전 아기 수면 습관 만들기', '읽을거리 카드가 어떻게 보이는지 확인하는 예시예요.', '다다맘 (테스트 예시)', 'https://dadamom.co.kr/community.html#/b/all', current_date - 3, 0),
  ('instagram', '(테스트 예시) 이유식 시작 체크리스트', '인스타 카드 예시예요.', '다다맘 (테스트 예시)', 'https://dadamom.co.kr/', current_date - 5, 0);

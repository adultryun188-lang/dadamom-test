-- =============================================================================
-- 테스트용 가상 콘텐츠 (테스트 프로젝트에서만 실행)
-- 001_test_users.sql 을 먼저 실행해야 합니다.
--
-- 전부 지어낸 내용입니다. 실제 인물·행사·브랜드와 무관합니다.
-- 사진은 올리지 않습니다. 이미지 업로드는 앱에서 직접 테스트하세요.
-- =============================================================================
begin;

-- ------------------------------------------------------------- 공지 --
insert into public.notices (title, body, pinned, owner_id) values
  ('[테스트] 다다맘 TEST 환경입니다',
   E'여기는 검증용 앱이에요. 여기에 올린 글과 사진은 운영 앱에 보이지 않습니다.\n마음껏 눌러보셔도 됩니다.', true,
   '11111111-1111-1111-1111-111111111111'),
  ('[테스트] 10월 체험단 모집 안내',
   '테스트용 공지입니다. 실제 모집이 아닙니다.', false,
   '11111111-1111-1111-1111-111111111111');

-- --------------------------------------------------------- 커뮤니티 --
insert into public.community_posts (owner_id, author, text, status, stage, age_value, likes, comments, created_at) values
  ('22222222-2222-2222-2222-222222222222', '하람맘', '[질문] 15개월인데 아직 두 단어를 못 붙여요. 다들 언제쯤 문장이 나왔나요?', 'approved', 'parenting', 15, 12, 2, now() - interval '3 hours'),
  ('22222222-2222-2222-2222-222222222222', '하람맘', '[자랑] 오늘 처음으로 혼자 열 걸음 걸었어요. 눈물 났습니다.',               'approved', 'parenting', 15,  31, 1, now() - interval '1 day'),
  ('33333333-3333-3333-3333-333333333333', '콩이맘', '[고민] 28주인데 밤에 잠을 통 못 자요. 옆으로 누우면 좀 나을까요?',        'approved', 'pregnant',  28,  8, 0, now() - interval '5 hours'),
  ('44444444-4444-4444-4444-444444444444', '도윤파', '[정보] 경기권 실내 놀이터 몇 군데 다녀본 후기 정리해봤어요.',              'approved', 'parenting',  7, 19, 0, now() - interval '2 days'),
  ('44444444-4444-4444-4444-444444444444', '도윤파', '[자랑] 검수 대기 상태 확인용 글입니다.',                                   'pending',  'parenting',  7,  0, 0, now() - interval '10 minutes');

-- 댓글
insert into public.post_comments (post_id, owner_id, author, content, created_at)
select p.id, '33333333-3333-3333-3333-333333333333', '콩이맘', '저희는 18개월쯤 터졌어요. 조금만 더 기다려보세요!', now() - interval '2 hours'
from public.community_posts p where p.text like '[질문]%' limit 1;

insert into public.post_comments (post_id, owner_id, author, content, created_at)
select p.id, '44444444-4444-4444-4444-444444444444', '도윤파', '축하드려요!', now() - interval '20 hours'
from public.community_posts p where p.text like '[자랑] 오늘%' limit 1;

-- ----------------------------------------------------------- 챌린지 --
insert into public.challenge_entries (owner_id, name, age, note, status, votes, created_at) values
  ('22222222-2222-2222-2222-222222222222', '하람', '15개월', '첫걸음 미션 인증합니다!',       'approved', 24, now() - interval '1 day'),
  ('44444444-4444-4444-4444-444444444444', '도윤', '7개월',  '뒤집기 성공한 날 기록이에요.',  'approved', 11, now() - interval '3 days'),
  ('44444444-4444-4444-4444-444444444444', '도윤', '7개월',  '검수 대기 확인용 인증입니다.',  'pending',   0, now() - interval '5 minutes');

-- ----------------------------------------------------------- 나들이 --
insert into public.outings (category, region, title, place, address, hours, fee, age_fit, link_url, source, checked_on, starts_on, ends_on, description, emoji, sort_order) values
  ('event','인천','[테스트] 인천 어린이 가을 축제','테스트 문화회관','인천광역시 남동구 구월동 1306-15','10:00~17:00 (월 휴관)','무료','전체','https://example.com/test-event','테스트 데이터', current_date, current_date, current_date + 5,
   E'테스트용 가상 행사입니다. 실제로 열리지 않습니다.\n상세 시트와 지도 링크 확인용이에요.','🍁',1),
  ('event','서울','[테스트] 마감 임박 표시 확인용','테스트 광장',null,null,'무료','전체',null,'테스트 데이터', current_date, current_date, current_date + 1,
   '종료일이 내일이라 D-1 배지가 붙어야 합니다.','⏰',2),
  ('event','경기','[테스트] 이미 끝난 행사','테스트 공원',null,null,null,'전체',null,'테스트 데이터', current_date, current_date - 10, current_date - 1,
   '종료일이 지났으므로 목록에서 자동으로 빠져야 합니다.','🚫',3),
  ('spot','인천','[테스트] 상시 운영 실내놀이터','테스트 키즈카페','인천광역시 남동구 어딘가 12','11:00~20:00','2시간 15,000원','0~5세',null,'테스트 데이터', current_date, null, null,
   '종료일이 없어 상시로 표시돼야 합니다.','🧸',4);

commit;

-- 확인
select '공지'     as 항목, count(*) from public.notices
union all select '커뮤니티글', count(*) from public.community_posts
union all select '댓글',      count(*) from public.post_comments
union all select '챌린지',    count(*) from public.challenge_entries
union all select '나들이',    count(*) from public.outings;

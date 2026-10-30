// 테스트(스테이징) 환경. 테스트용 Supabase 프로젝트 dadamom-test 를 바라본다.
// 운영 프로젝트와는 완전히 별개의 프로젝트다. (운영 ref 는 이 파일에 적지 않는다 —
// 배포 워크플로가 운영 참조를 발견하면 빌드를 실패시킨다)
window.DADAMOM_ENV = {
  ENV: 'staging',
  SUPABASE_URL: 'https://srxdtddrtnhtlbbviyvs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeGR0ZGRydG5odGxiYnZpeXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzExNTYsImV4cCI6MjEwNjI0NzE1Nn0.UDCz6EFCI4-nasNxTbJMLvA8PgfvttF_0TnLsyaQbw4',
  APP_NAME: '다다맘 TEST',
  // 2026-10-05: 테스트 프로젝트에도 카카오·구글 제공자를 등록했다.
  // (/auth/v1/settings 로 google:true, kakao:true 확인)
  // 이전에는 등록이 없어 버튼을 누르면 'provider is not enabled' JSON 이 그대로 떴다.
  SOCIAL_LOGIN: true,
  // 네이버 Client 등록·테스트 Supabase custom:naver 연동 전에는 요청하지 않는다.
  // 실제 OAuth 왕복 검증을 준비한 뒤에만 true로 바꾼다. 비밀키는 이 파일에 넣지 않는다.
  NAVER_LOGIN: true,
  SHOW_TEST_BADGE: true,
  // 가족 공유 시행일(운영 2026-11-06)을 테스트에서는 앞당긴다
  FAMILY_OPEN_AT: '2026-10-01T00:00:00+09:00',
  BUILD: '__BUILD__'
};

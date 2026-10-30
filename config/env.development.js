// 로컬 개발용. scripts/build.sh dev 가 이 파일을 env.js 로 복사한다.
// anon key 는 브라우저에 노출되는 것을 전제로 설계된 공개 키다.
// service_role / secret key 는 어떤 환경 파일에도 넣지 않는다.
window.DADAMOM_ENV = {
  ENV: 'development',
  SUPABASE_URL: 'https://srxdtddrtnhtlbbviyvs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeGR0ZGRydG5odGxiYnZpeXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzExNTYsImV4cCI6MjEwNjI0NzE1Nn0.UDCz6EFCI4-nasNxTbJMLvA8PgfvttF_0TnLsyaQbw4',
  APP_NAME: '다다맘 DEV',
  // 로컬 개발에서는 카카오·구글 버튼을 숨긴다.
  SOCIAL_LOGIN: false,
  NAVER_LOGIN: 'preview',
  SHOW_TEST_BADGE: true,
  // 가족 공유 시행일(운영 2026-11-06)을 테스트에서는 앞당긴다
  FAMILY_OPEN_AT: '2026-10-01T00:00:00+09:00',
  BUILD: 'local'
};

// 테스트(스테이징) 환경. 테스트용 Supabase 프로젝트 dadamom-test 를 바라본다.
// 운영 프로젝트와는 완전히 별개의 프로젝트다. (운영 ref 는 이 파일에 적지 않는다 —
// 배포 워크플로가 운영 참조를 발견하면 빌드를 실패시킨다)
window.DADAMOM_ENV = {
  ENV: 'staging',
  SUPABASE_URL: 'https://srxdtddrtnhtlbbviyvs.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyeGR0ZGRydG5odGxiYnZpeXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzExNTYsImV4cCI6MjEwNjI0NzE1Nn0.UDCz6EFCI4-nasNxTbJMLvA8PgfvttF_0TnLsyaQbw4',
  APP_NAME: '다다맘 TEST',
  SHOW_TEST_BADGE: true,
  BUILD: '__BUILD__'
};

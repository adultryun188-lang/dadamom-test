// 운영 환경 예시. 실제 값은 이 저장소에 넣지 않는다.
// 운영 배포는 별도 저장소(adultryun188-lang/dadamom-app)에서 이뤄지며,
// 이 파일은 "운영에서는 이런 모양이 된다"를 보여주기 위한 예시일 뿐이다.
window.DADAMOM_ENV = {
  ENV: 'production',
  SUPABASE_URL: 'https://<운영-프로젝트-ref>.supabase.co',
  SUPABASE_ANON_KEY: '<운영 anon public key>',
  APP_NAME: '다다맘',
  // 운영에는 카카오·구글이 연결돼 있다
  SOCIAL_LOGIN: true,
  SHOW_TEST_BADGE: false,
  BUILD: '__BUILD__'
};

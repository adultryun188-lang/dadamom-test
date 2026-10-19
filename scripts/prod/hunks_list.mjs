// 운영→테스트 index.html 차이(-U0)의 훅 목록: 번호, 분류, 바뀌는 줄 요약. 가족·환경이 섞인 훅은 MIX 로 표시.
import fs from 'node:fs';
const diff = fs.readFileSync(process.argv[2], 'utf8');
const hunks = diff.split(/\n(?=@@ )/).slice(1);
const FAM = /\bfam[A-Z_]|famQueue|famPull|famFlush|family|가족|FAMILY|consent-family/;
const ENV = /env\.js|다다맘 TEST|테스트 앱|SOCIAL_LOGIN|DADAMOM_ENV|SUPABASE_URL|SUPABASE_KEY|test-banner|SHOW_TEST_BADGE|srxdtddrtnhtlbbviyvs|hjqchbpxwviengdzvado|ENV\./;
hunks.forEach((h, i) => {
  const lines = h.split('\n');
  const ch = lines.slice(1).filter((l) => l[0] === '+' || l[0] === '-');
  const fam = ch.filter((l) => FAM.test(l)).length, env = ch.filter((l) => ENV.test(l)).length;
  const tag = fam && fam < ch.length ? 'MIXF' : fam ? 'FAM ' : env && env < ch.length ? 'MIXE' : env ? 'ENV ' : 'OK  ';
  const pick = ch.find((l) => l.trim().length > 3) || '';
  console.log(String(i + 1).padStart(3), tag, lines[0].replace(/^@@ (.*?) @@.*/, '$1').padEnd(22), '+' + ch.filter((l) => l[0] === '+').length, '-' + ch.filter((l) => l[0] === '-').length, '|', pick.slice(0, 95));
});

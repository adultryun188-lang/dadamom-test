// 테스트 community.html 로 운영본을 만든다. cwd = dadamom-app (운영 저장소)
// env.js 대신 운영 index.html 의 공개 설정(URL·anon key)을 그대로 넣는다.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// 이 저장소(dadamom-test)의 community.html
const T = fileURLToPath(new URL('../../community.html', import.meta.url));
const s = fs.readFileSync('index.html', 'utf8');
const url = s.match(/var SUPABASE_URL = '([^']+)'/)[1];
const key = s.match(/var SUPABASE_KEY = '([^']+)'/)[1];
let c = fs.readFileSync(T, 'utf8').replace(/\r\n/g, '\n');
const tag = '<script src="./env.js"></script>';
if (c.split(tag).length !== 2) { console.error('STOP env tag'); process.exit(1); }
c = c.replace(tag, () => `<script>window.DADAMOM_ENV = { SUPABASE_URL: '${url}', SUPABASE_ANON_KEY: '${key}' };</script>`)
     .replace('<!-- 앱(index.html)과 같은 환경설정·같은 DB·같은 로그인 세션을 쓴다. -->', '<!-- 앱(index.html)과 같은 DB·같은 로그인 세션을 쓴다. 키는 index.html 과 같은 공개(anon) 키다. -->');
if (/srxdtddrtnhtlbbviyvs|env\.js/.test(c)) { console.error('STOP 테스트 흔적'); process.exit(1); }
fs.writeFileSync('community.html', c);
console.log('운영본 준비 완료', url);

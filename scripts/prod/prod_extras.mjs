// 웹 보충 묶음을 운영 저장소(cwd = dadamom-app)에 옮긴다.
//  - index.html : 공유 미리보기(og:*) 블록 1곳 추가
//  - 404.html, icons/og-image.png : 테스트 저장소에서 그대로 복사
// community.html 은 prod_community.mjs 가 따로 만든다.
// 사용: node prod_extras.mjs [대상 폴더]  (기본: 현재 폴더)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const T = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/]$/, '');   // 이 저장소(dadamom-test)
const dst = process.argv[2] || '.';

const test = fs.readFileSync(T + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const A = '<!-- 공유 미리보기 -->\n', B = '<!-- /공유 미리보기 -->\n';
const i = test.indexOf(A), j = test.indexOf(B);
if (i < 0 || j < 0) { console.error('STOP: 테스트본에 미리보기 블록 없음'); process.exit(1); }
const block = test.slice(i, j + B.length);

const idx = path.join(dst, 'index.html');
let s = fs.readFileSync(idx, 'utf8');
if (s.includes('\r')) { console.error('STOP: CR'); process.exit(1); }
if (s.includes(A)) { console.error('STOP: 이미 적용됨'); process.exit(1); }
const anchor = '<meta name="theme-color" content="#C94318">\n';
const n = s.split(anchor).length - 1;
console.log('[미리보기 자리] ' + n);
if (n !== 1) { console.error('STOP: 자리 못 찾음'); process.exit(1); }
s = s.replace(anchor, () => anchor + block);
fs.writeFileSync(idx, s);

fs.writeFileSync(path.join(dst, '404.html'), fs.readFileSync(T + '/404.html', 'utf8').replace(/\r\n/g, '\n'));
fs.copyFileSync(T + '/icons/og-image.png', path.join(dst, 'icons', 'og-image.png'));
console.log('운영본 준비 완료: index.html(미리보기), 404.html, icons/og-image.png');

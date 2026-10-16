// 테스트 커밋 48f9253(참가작 카드·MY 동그라미)을 운영 index.html 에 적용한다.
// 사용: node prod_patch.mjs <대상 index.html> <패치 파일>  — 테스트 커밋의 index.html 훅을 그대로 찾아 바꾼다.
// git apply 대신 직접 바꾸는 이유: PowerShell 파이프가 한글 패치를 깨뜨릴 수 있어서.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || 'index.html';
const patch = fs.readFileSync(path.resolve(process.argv[3] || path.join(here, "fix2.patch")), 'utf8');
let s = fs.readFileSync(target, 'utf8');
if (s.includes('\r')) { console.error('STOP: CR'); process.exit(1); }
// 훅마다: 컨텍스트+'-' 줄 = 찾을 글, 컨텍스트+'+' 줄 = 바꿀 글
const hunks = patch.split(/\n(?=@@ )/).slice(1);
for (const h of hunks) {
  const lines = h.split('\n').slice(1).filter((l, i, a) => !(i === a.length - 1 && l === ''));
  const from = [], to = [];
  for (const l of lines) {
    if (l.startsWith('\\')) continue;
    const c = l[0], t = l.slice(1);
    if (c === ' ' || c === '-') from.push(t);
    if (c === ' ' || c === '+') to.push(t);
  }
  const a = from.join('\n'), b = to.join('\n');
  const n = s.split(a).length - 1;
  console.log('[훅] 일치 ' + n);
  if (n !== 1) { console.error('STOP: 운영본과 맞지 않는 곳'); process.exit(1); }
  s = s.replace(a, () => b);
}
fs.writeFileSync(target, s);
console.log('운영 index.html 준비 완료 (' + hunks.length + '곳)');

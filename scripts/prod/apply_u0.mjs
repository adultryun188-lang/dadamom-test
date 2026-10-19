// -U0 패치를 줄 번호로 적용한다 (뒤에서부터). 지울 줄이 원본과 한 글자라도 다르면 멈춘다.
//   node apply0.mjs <원본> <패치> <결과>
import fs from 'node:fs';
const [,, src, patchFile, out] = process.argv;
const base = fs.readFileSync(src, 'utf8');
if (base.includes('\r')) throw new Error('CR in base');
const lines = base.split('\n');
const hunks = fs.readFileSync(patchFile, 'utf8').split(/\n(?=@@ )/).slice(1).map((h) => {
  const rows = h.split('\n');
  const m = rows[0].match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
  if (!m) throw new Error('bad header ' + rows[0]);
  const a = +m[1], b = m[2] === undefined ? 1 : +m[2];
  const del = [], add = [];
  for (const r of rows.slice(1)) {
    if (r.startsWith('\\')) continue;
    if (r[0] === '-') del.push(r.slice(1)); else if (r[0] === '+') add.push(r.slice(1));
  }
  if (del.length !== b) throw new Error('count mismatch ' + rows[0]);
  return { a, b, del, add, head: rows[0] };
});
hunks.sort((x, y) => y.a - x.a);
for (const h of hunks) {
  const at = h.b === 0 ? h.a : h.a - 1;          // b=0: a 번째 줄 "뒤"에 넣는다
  const cur = lines.slice(at, at + h.b);
  if (cur.join('\n') !== h.del.join('\n')) throw new Error('mismatch at ' + h.head + '\n원본: ' + cur.join('|').slice(0, 200));
  lines.splice(at, h.b, ...h.add);
}
fs.writeFileSync(out, lines.join('\n'));
console.log('applied', hunks.length);

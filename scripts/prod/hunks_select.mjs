// full.diff(-U0)에서 고른 훅만 남긴 패치를 만든다.  node select.mjs <full.diff> <out.patch> <번호들,쉼표> [--show]
import fs from 'node:fs';
const [,, src, out, list, show] = process.argv;
const diff = fs.readFileSync(src, 'utf8');
const parts = diff.split(/\n(?=@@ )/);
const header = parts[0];
const hunks = parts.slice(1);
const want = new Set(list.split(',').map(Number));
const kept = hunks.filter((h, i) => want.has(i + 1));
fs.writeFileSync(out, header + '\n' + kept.join('\n') + (kept.length ? '\n' : ''));
if (show) hunks.forEach((h, i) => { if (want.has(i + 1)) console.log('##### ' + (i + 1) + '\n' + h.split('\n').map((l) => l.slice(0, 200)).join('\n')); });
console.log('kept', kept.length);

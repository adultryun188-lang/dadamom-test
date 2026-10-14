// P0-03 거부 훅 2개를 운영본에 넣는다. cwd = dadamom-app, 인자 = r1.rej 경로
import fs from 'node:fs';
const rej = fs.readFileSync(process.argv[2], 'utf8').split('\n');
let s = fs.readFileSync('index.html', 'utf8');
if (s.includes('\r')) { console.error('STOP: CR'); process.exit(1); }

// 헬퍼 블록: .rej 의 '+  // ---------- 반응' 부터 첫 컨텍스트 줄 전까지의 '+' 줄
const start = rej.findIndex(l => l.startsWith('+  // ---------- 반응'));
const block = [];
for (let i = start; i < rej.length && rej[i].startsWith('+'); i++) block.push(rej[i].slice(1));
console.log(`헬퍼 블록 ${block.length}줄 (마지막 줄 비어있음: ${block[block.length - 1] === ''})`);

const once = (name, find, repl) => {
  const n = s.split(find).length - 1;
  console.log(`[${name}] ${n}`);
  if (n !== 1) { console.error(`STOP: ${name} = ${n}`); process.exit(1); }
  s = s.replace(find, repl);
};

const fe = '  async function fetchEntries(){';
once('헬퍼 삽입', fe, block.join('\n') + '\n' + fe);

once('응원 목록', "      var merged = newestFirst(res.data.concat(await fetchOwnUnapproved('challenge_entries')));\n",
  "      var merged = newestFirst(res.data.concat(await fetchOwnUnapproved('challenge_entries')));\n" +
  "      var mineVotes = await fetchMyReactionIds('entry_votes', 'entry_id');\n" +
  "      if(mineVotes){ state.myVotes = mineVotes; save(); }\n" +
  "      var votedIds = mineVotes || state.myVotes;\n");
once('응원 liked', 'liked: state.myVotes.indexOf(r.id) > -1', 'liked: votedIds.indexOf(r.id) > -1');

once('좋아요 목록', "      var merged = newestFirst(res.data.concat(await fetchOwnUnapproved('community_posts')));\n",
  "      var merged = newestFirst(res.data.concat(await fetchOwnUnapproved('community_posts')));\n" +
  "      var mineLikes = await fetchMyReactionIds('post_likes', 'post_id');\n" +
  "      if(mineLikes){ state.myLikes = mineLikes; save(); }\n" +
  "      var likedIds = mineLikes || state.myLikes;\n");
once('좋아요 liked', 'liked: state.myLikes.indexOf(r.id) > -1', 'liked: likedIds.indexOf(r.id) > -1');

fs.writeFileSync('index.html', s);
console.log('── 완료 ──');

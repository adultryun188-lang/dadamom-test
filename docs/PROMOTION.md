# 테스트 → 운영 이관 절차

테스트 앱에서 검증이 끝난 변경만 운영으로 옮깁니다.
**모든 단계는 서비스 책임자의 명시적 승인 후에 진행합니다.**

## 원칙

1. 운영에 먼저 적용하지 않는다. 항상 테스트가 앞선다.
2. 테스트에서 통과한 것과 **같은 변경**만 옮긴다. 옮기면서 고치지 않는다.
3. DB 변경은 코드 배포보다 **먼저** 적용한다 (새 컬럼을 쓰는 코드가 먼저 나가면 깨진다).
4. 운영 배포 전 되돌릴 지점을 기록한다.

## 절차

### 1. 옮길 내용 확정
```bash
# 운영본과 테스트본의 차이 확인
diff <(git show main:index.html) index.html
```
테스트 전용 변경(TEST 띠, env.js 참조, 서비스워커)은 **옮기지 않습니다.**
운영에 PWA 를 넣을 시점이 오면 그때 별도 안건으로 다룹니다.

### 2. 승인 요청
다음을 정리해 보고합니다.
- 변경 파일과 줄 수
- 적용할 마이그레이션 목록과 순서
- 테스트 결과
- 되돌리는 방법
- 남은 위험

### 3. 운영 백업
- Supabase → Database → Backups 확인
- 필요한 테이블은 SQL Editor 에서 `copy … to` 또는 Export 로 별도 보관
- 현재 운영 `index.html` 의 SHA-256 기록

### 4. 마이그레이션 적용
1. `begin; … rollback;` 으로 **리허설** 후 결과 확인
2. 문제 없으면 `begin; … commit;` 으로 적용
3. 권한 테스트(`tests/rls.spec.sql`)를 운영에서 다시 한 번 실행

### 5. 코드 배포
`dadamom-app` 저장소 `main` 에 반영하고, 배포 후 파일 해시가 의도한 값과 같은지 확인합니다.

### 6. 배포 후 확인
`docs/RUNBOOK.md` 의 점검 목록을 운영 주소로 한 번 더 수행합니다.

## 되돌리기

| 대상 | 방법 |
|---|---|
| 코드 | 이전 커밋의 `index.html` 을 다시 배포 |
| DB | 해당 마이그레이션의 역방향 SQL 실행 |
| Storage 정책 | 이전 정책을 다시 `create policy` |

---

# P0-04 (사진 보안) 운영 이관 — 특별 절차

> 이 작업은 **평소 절차로는 부족합니다.** 마이그레이션만 돌리면 기존 사진이 그대로 열립니다.
> 2026-09-30 테스트 환경에서 실측으로 확인한 내용입니다.

## 왜 특별한가

**서명 URL 은 버킷 설정을 바꿔도 죽지 않습니다.**

테스트에서 실제로 측정한 결과:

| 확인한 것 | 결과 |
|---|---|
| 버킷을 private 으로 바꾼 뒤 옛 공개 URL | **400 차단** ✅ |
| 버킷을 private 으로 바꾼 뒤 옛 10년 서명 URL | **200 열림** ❌ |
| 파일을 삭제(또는 이동)한 뒤 그 서명 URL | **400 차단** ✅ |

서명 URL 의 토큰은 그 자체가 열쇠이고 RLS 를 거치지 않습니다. 토큰 안에 경로
(`{"url":"media/u-179....jpg"}`)가 박혀 있으므로, **그 경로에 파일이 없어야만 죽습니다.**

운영 DB 에 저장된 `media_url` 들은 전부 만료 **2036년**짜리입니다.
파일을 옮기지 않으면 지금까지 뿌려진 모든 사진 URL 이 10년간 살아 있습니다.

## 이관 순서

**1) 마이그레이션 적용 (DB)**
```
supabase/migrations/0003_media_private.sql
supabase/migrations/0004_delete_account_storage_fix.sql
```
`0003` 이 `media_path` 컬럼을 만들고 기존 `media_url` 에서 경로를 뽑아 채웁니다.

**2) 기존 파일을 `<사용자ID>/` 로 이동  ← 이 단계를 빼먹으면 의미가 없습니다**

SQL 로는 안 됩니다. Supabase 가 `storage.objects` 직접 조작을 트리거로 막습니다
(`ERROR 42501: Direct deletion from storage tables is not allowed`).
반드시 **Storage API** 로 옮겨야 하고, 소유자 정보가 필요하므로 `service_role` 키가 있어야 합니다.

```bash
# 사장님 컴퓨터에서 실행. 키는 환경변수로만 두고 저장소에 넣지 않습니다.
export SUPABASE_URL='https://<운영ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='...'   # 절대 커밋 금지
node scripts/migrate_media_paths.mjs --dry-run   # 먼저 확인
node scripts/migrate_media_paths.mjs             # 실제 이동
```

스크립트가 하는 일: `media_path` 가 있고 아직 `<uid>/` 형태가 아닌 행마다
① 소유자(`owner_id`) 확인 → ② `storage.move(옛경로, uid/파일명)` →
③ `media_path` 를 새 경로로 갱신. 하나라도 실패하면 그 행은 건너뛰고 로그에 남깁니다.

**3) 코드 배포** — `index.html` (경로 저장 + 짧은 서명 URL + 이미지 전용)

**4) 확인**
- 옛 `media_url` 하나를 골라 브라우저에서 열어 **400** 이 나오는지
  (⚠️ **반드시 캐시 무시로** — CDN 이 캐싱해서 잠시 200 이 나올 수 있습니다.
   `fetch(url + '&cb=' + Date.now(), {cache:'no-store'})`)
- 비로그인으로 커뮤니티를 열어 승인된 글의 사진이 보이는지
- 로그인해서 사진 한 장 올리고 → 검수 → 승인 → 비로그인에서 보이는지
- 글을 지운 뒤 그 사진 URL 이 막히는지

## 같이 나가는 변경

`0004` 는 **계정 삭제 버그 수정**입니다. 기존 `delete_my_account()` 는
`storage.objects` 를 직접 지우는데 위 트리거에 걸려 **항상 실패**합니다.
계정 삭제는 App Store 심사 필수 항목이므로 이 수정 없이 출시하면 안 됩니다.
파일 삭제는 클라이언트가 Storage API 로 먼저 하도록 옮겼습니다
(`index.html` 의 `handleDeleteAccount`). **DB 와 코드를 반드시 같이 배포하세요.**

## 되돌리기

`0003_media_private.sql` 맨 아래 주석에 원복 SQL 이 있습니다.
다만 **2단계에서 옮긴 파일은 자동으로 안 돌아옵니다.** 원복하려면 같은 스크립트를
반대 방향으로 돌려야 합니다. 2단계 전에 되돌릴지 판단하는 편이 낫습니다.

---

# P0-03 (반응 조작 방지) 운영 이관 — 결정이 필요한 항목

## 먼저: 0002 의 revoke 는 듣지 않습니다

`0002_tighten_anon_grants.sql` 은 승인 대기 중인 운영 변경 목록에 있습니다.
그 파일의 42~44행

```sql
revoke execute on function public.increment_votes(uuid,int) from anon;
```

**는 효과가 없습니다.** PostgreSQL 은 함수 EXECUTE 를 기본으로 `PUBLIC` 에 부여하고,
`anon` 은 그 PUBLIC 권한을 상속합니다. `anon` 에게서만 회수해도 PUBLIC 경로가 남습니다.
(baseline 의 `delete_my_account()` 는 `from public, anon` 으로 제대로 막았습니다.)

2026-09-30 테스트 프로젝트 실측 — 0002 가 적용된 상태에서:

| 시도 | 결과 |
|---|---|
| anon INSERT `community_posts` | 401 `permission denied for table` ✅ 0002 가 듣는다 |
| anon RPC `increment_votes(delta=7)` | **204 성공, votes 11 → 18** ❌ 듣지 않는다 |
| 로그인 사용자 `increment_likes` 50회 | **실패 0건, likes 12 → 62** ❌ |
| 로그인 사용자 `increment_likes(delta=-5)` | **성공, 남의 글 31 → 26** ❌ |
| REST PATCH 로 `likes` 컬럼 직접 덮어쓰기 | 값 안 바뀜 ✅ RLS 가 막는다 |

`0005` 는 이 함수들을 revoke 가 아니라 **drop** 하므로 PUBLIC 경로까지 사라집니다.
따라서 **0002 를 운영에 적용하더라도 0005 를 같이 적용해야** 이 구멍이 닫힙니다.
0002 만 적용하면 "막았다고 생각하지만 안 막힌" 상태가 됩니다.

## 함께 발견된 것 — 지금까지 좋아요·응원은 서버에 저장된 적이 없습니다

운영·테스트 `index.html` 이 RPC 를 이렇게 불렀습니다.

```js
sb.rpc('increment_likes', { p_id: pid, delta: ... })
```

함수의 파라미터 이름은 `post_id` 입니다. `p_id` 로는 함수를 찾지 못해
**항상 HTTP 404 (PGRST202) 로 실패**했고, 코드가 `.catch(function(){})` 로 삼켜서
아무 표시도 나지 않았습니다. 즉 화면의 숫자는 기기 `localStorage` 값이고
DB 의 `likes`/`votes` 는 시드값 그대로였습니다.

이 때문에 **운영의 현재 카운터 값에는 실제 사용자 반응이 반영돼 있지 않습니다.**
아래 초기화 판단이 그만큼 가벼워집니다.

## 결정이 필요한 것 — 카운터 초기화

`0005` 의 백필은 카운터를 **실제 반응 행 수**로 다시 계산합니다.
반응 행이 없으므로 `votes`/`likes` 는 **0 이 됩니다**. (`comments` 는 실제 댓글 행 수로
맞춰지므로 오히려 정확해집니다.)

| 선택지 | 내용 | 비고 |
|---|---|---|
| **A) 그대로 0 으로** | 백필을 그대로 적용 | 위 발견대로 지금 숫자에 근거가 없어서 권장 |
| B) 기존 숫자 보존 | 백필 구간을 지우고 적용 | 카운터와 행 수가 어긋난 채로 시작. 이후 증감만 정확 |

B 를 고르면 `0005_reactions.sql` 의 `6) 백필 (파괴적 구간)` 두 `update` 문을
주석 처리하고 적용하세요. 그 외 구간은 파괴적이지 않습니다.

## 이관 순서

1. `begin; … rollback;` 리허설 — `tests/0005_rehearsal.sql`
   (운영에서 돌릴 때는 파일 안의 프로젝트 ref 주석만 참고하고 그대로 실행하면 됩니다)
2. 결과의 `② 행별 변화` 로 어떤 글의 숫자가 얼마나 깎이는지 확인
3. `supabase/migrations/0005_reactions.sql` 적용
4. `index.html` 배포 — **DB 보다 나중에** (새 테이블을 쓰는 코드입니다)
5. 확인
   - 로그인해서 응원/좋아요를 누르고 새로고침해도 유지되는지
   - **다른 기기·다른 브라우저**에서 같은 계정으로 들어가도 눌린 상태가 보이는지
     (이전에는 기기별 `localStorage` 라 안 따라왔습니다)
   - 비로그인으로 커뮤니티를 열어 숫자가 보이는지
   - `tests/reactions.spec.ps1` 로 중복·타인·비로그인 시도가 막히는지

## 되돌리기

`0005_reactions.sql` 맨 아래 주석에 역방향 SQL 이 있습니다.
**단, 백필로 덮어쓴 카운터 값은 되돌아오지 않습니다.** 3단계 전에 판단하세요.
보존이 필요하면 미리 남겨두세요.

```sql
create table _counter_backup_20260930 as
  select 'entry' as k, id, votes as n from public.challenge_entries
  union all select 'post', id, likes from public.community_posts;
```

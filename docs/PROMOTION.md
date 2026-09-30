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

# 운영 안내서 (테스트 환경)

## 배포

테스트 앱은 GitHub Pages 가 `staging` 브랜치를 그대로 서빙합니다.

1. `staging` 브랜치에 커밋
2. 1~2분 뒤 https://adultryun188-lang.github.io/dadamom-test/ 에 반영
3. 반영 확인: 앱 상단 TEST 띠 옆의 빌드 시각이 바뀌었는지 본다

`index.html` 과 `env.js` 는 서비스워커가 network-first 로 가져오므로, 새로고침하면 바로 최신이 됩니다.

### 설치된 PWA 가 옛 화면을 보여줄 때

1. 앱을 완전히 종료 후 재실행 (보통 이걸로 해결)
2. 그래도 안 되면 브라우저에서 사이트 데이터 삭제 후 재설치
3. 개발자도구 → Application → Service Workers → `Unregister`

## 롤백

### 테스트 앱
```bash
git checkout staging
git revert <되돌릴 커밋>
git push
```
또는 특정 시점으로:
```bash
git reset --hard <좋았던 커밋>
git push --force-with-lease
```

### 테스트 DB
마이그레이션은 모두 트랜잭션으로 감싸여 있어 실패 시 자동 롤백됩니다.
이미 적용한 것을 되돌리려면 해당 마이그레이션의 역방향 SQL 을 직접 작성해 실행합니다.
최후의 수단으로 **테스트 프로젝트를 삭제하고 `0001_baseline` 부터 다시 세워도 됩니다.**
테스트 데이터는 전부 지어낸 값이라 잃을 것이 없습니다.

### 운영
이 저장소의 작업은 운영에 영향을 주지 않습니다.
운영 롤백이 필요한 상황이면 `dadamom-app` 저장소에서 별도로 처리합니다.

기준점: 운영 마지막 배포 커밋 `9cd1644`, `index.html` SHA-256 `14655ed7262aefa03533cd1a8e3dbb28f6210ab582a4e354f9300e8486e7427d`

## 점검 목록

배포 후 매번 확인:

- [ ] 상단에 빨간 TEST 띠가 보인다
- [ ] 빌드 시각이 방금 배포한 시각이다
- [ ] 접속한 Supabase 가 `srxdtddrtnhtlbbviyvs` 다 (개발자도구 Network 탭)
- [ ] 비로그인으로 커뮤니티가 보이고, 다른 탭은 막힌다
- [ ] 320 / 360 / 390 / 430px 에서 가로 스크롤이 생기지 않는다

## 이메일로 계정 삭제 요청이 왔을 때 (운영)

`delete-account.html`(구글 플레이 "계정 삭제 안내 URL")에서 **받은 날부터 10일 이내** 처리를 약속했다.
앱의 "회원 탈퇴"가 하는 일을 사람이 대신 하는 것이다. 순서가 중요하다 — **사진을 먼저, 계정을 나중에.**
계정을 먼저 지우면 어느 사진이 그 사람 것인지 표에서 찾을 수 없게 된다.

1. **본인 확인** — Supabase(운영) › Authentication › Users 에서 이메일로 찾는다.
   요청 메일의 보낸 주소가 가입 이메일과 다르면, 가입 이메일로 확인 메일을 보내고 답장을 받은 뒤 진행한다.
   찾은 사용자의 **User UID** 를 적어 둔다.
2. **사진 파일 지우기** — Storage › `media` 버킷 › `<User UID>` 폴더 전체 삭제, `album` 버킷 › `<User UID>` 폴더 전체 삭제.
   예전 경로에 남은 파일이 있는지 SQL Editor 로 한 번 더 본다 (결과가 있으면 그 경로도 Storage 에서 지운다):
   ```sql
   select media_path from public.community_posts   where owner_id = '<User UID>' and media_path is not null
   union all
   select media_path from public.challenge_entries where owner_id = '<User UID>' and media_path is not null
   union all
   select path       from public.album_photos      where owner_id = '<User UID>';
   ```
   (`storage.objects` 를 SQL 로 직접 지울 수는 없다 — CLAUDE.md 4절. 대시보드 Storage 화면에서 지운다.)
3. **계정 지우기** — Authentication › Users › 그 사용자 › **Delete user**.
   글·댓글·참가작·체험단 신청과 배송정보·동의 이력·좋아요·스크랩·응원·차단·내가 한 신고·성장 앨범 기록이
   DB 에서 함께 지워진다 (외래키 `on delete cascade`, 2026-10-19 운영에서 확인).
4. **확인** — 위 2번 SQL 과 `select count(*) from public.profiles where id = '<User UID>';` 가 모두 0.
5. **회신** — "삭제를 마쳤습니다. 수유·수면·성장 기록은 기기에만 저장돼 있어, 앱을 지우거나 브라우저의 사이트 데이터를 지우면 함께 삭제됩니다."
6. 요청 받은 날·처리한 날을 따로 적어 둔다 (10일 기한 확인용).

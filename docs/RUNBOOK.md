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

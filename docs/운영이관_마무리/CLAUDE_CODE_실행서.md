# 운영 마무리 실행서 (Claude Code 용) — 2026-10-06

> 작성: Claude(클라우드 세션). **사장님 승인: "다 진행해, 묻지 마".**
> 클라우드 세션은 운영 변경이 세션 안전장치에 막혀 여기까지 준비했습니다.
> 아래만 하면 운영이 테스트와 같은 기능 상태가 됩니다(P0-03·0009·0010 제외).

## 0. 순서

1. **운영 SQL** — 사장님이 `운영SQL_한번에.sql` 을 운영 SQL Editor 에 붙여 Run (한 번).
   결과 한 줄: `가입동의종류 = true · 남은개인정보컬럼 = 0` 이면 OK.
   (0012 와 P0-05 단계 C 를 한 트랜잭션으로. 테스트 DB 면 스스로 멈춤.)
2. **코드** — 아래 2절. **반드시 1 다음.** 거꾸로면 가입 동의가 CHECK 에 걸려 기록이 안 남음.

## 1. 클라우드 세션이 확인한 운영 상태 (2026-10-06 11:30, Supabase 읽기)

| | |
|---|---|
| 운영 `main` / 라이브 | `93ef1209` / `567b9d7c` |
| `entry_votes` 없음 (운영 맞음) | ✅ |
| 체험단 신청 | 1건 · 본문 `contact`/`address` **비어 있음** · PII 표 1건(값 있음, 89일 뒤 파기) |
| 동의 원장 | `trial_shipping` 1 · `trial_brand_use` 1 — P0-05 경로가 운영에서 작동 |
| `signup_*` 허용 | 아직 아님 → 1번 SQL 이 해결 |

## 2. 코드 — `docs/운영이관_회원가입/지시서.md` 1~3절 그대로 + [C] 하나

### 2-1. 지시서 1~3절 그대로 (P1·P2 패치 + 손작업 [A][B])

중간 해시: **`6f24da324171d02b8571fc2f03d6b611692161feafd0fbdc1cf1fed2d3f77191`**
— 클라우드 세션이 2026-10-06 같은 절차를 처음부터 다시 따라 해서 **정확히 재현**했습니다
(P1 10개 중 9 적용 · P2 2개 중 1 적용 · [A] 블록 195줄 · [B] 1곳).

### 2-2. [C] 커뮤니티 빈 화면 문구 (새로 추가)

운영 커뮤니티에 글이 0개라 비로그인 첫 화면이 이 상태입니다. '전체' 를 보고 있는데
"아직 또래 글이 없어요 · **전체 보기로** 다른 글도 둘러보세요" 가 뜹니다.
테스트(`862d5054`)에서 고쳤고, **운영은 `feedFilter` 대신 `peerOnly` 를 쓰므로 운영판이 따로입니다.**

찾기 (정확히 1번):
```
      }).join('') : '<div class="card col" style="padding:18px; align-items:center; gap:6px;"><span style="font-size:13px; color:var(--text2);">' + (state.viewMineOnly === 'posts' ? '아직 작성한 글이 없어요' : '아직 또래 글이 없어요') + '</span><span class="helper">전체 보기로 다른 글도 둘러보세요</span></div>';
```
바꾸기:
```
      }).join('') : communityEmptyHtml();
```

그리고 `  function renderCommunity(){` 줄 **바로 위에** 삽입 (끝에 빈 줄 하나):
```
  // 커뮤니티 글 목록이 비었을 때. 예전에는 필터와 상관없이 "또래 글이 없어요 · 전체 보기로
  // 둘러보세요" 가 떠서, 이미 '전체' 를 보고 있는 사람에게 '전체' 를 보라고 했다.
  function communityEmptyHtml(){
    var mine = state.viewMineOnly === 'posts';
    var peer = !!state.peerOnly;
    var msg = mine ? '아직 작성한 글이 없어요'
            : peer ? '아직 또래 글이 없어요'
            : '아직 올라온 글이 없어요';
    var sub = (!mine && peer) ? '전체 보기로 다른 글도 둘러보세요'
            : (sb && !authUser) ? '로그인하고 첫 글을 남겨보세요'
            : '첫 글을 남겨보세요';
    return '<div class="card col" style="padding:18px; align-items:center; gap:6px;">' +
      '<span style="font-size:13px; color:var(--text2);">' + msg + '</span>' +
      '<span class="helper">' + sub + '</span></div>';
  }

```

### 2-3. 최종 해시 — 판정 기준

```
53a754330232c1075be4aba42db8e96940227c6a235a30e864a7dce99fb10f76   (310,234 바이트)
```

안 맞으면 멈추고 보고. `core.autocrlf=false`.

섞임 검사 0줄: `entry_votes post_likes sendReaction fetchMyReactionIds trial_application_counts
fetchMyApplications DADAMOM_ENV SOCIAL_LOGIN serviceWorker feedFilter restoreAuthDraft authPasswordFormHtml`

## 3. 클라우드 세션이 최종 후보(`53a75433`)로 확인한 것 — 운영 Supabase 를 읽으며 실행

| | 결과 |
|---|---|
| 런타임 오류 | 0 |
| 첫 화면 | 로그인 폼 + 카카오 + 구글 |
| 로그인 → 이메일 링크 → 복귀 | 이메일·비밀번호 유지 |
| 회원가입 탭 | 로그인에서 친 이메일 이어받음 · 규칙 ✓✓✓ · `다음` 활성화 조건 정상 |
| 2단계 | 필수 3개 체크 시 `가입 완료` 활성 · `이전` 시 이메일 유지 |
| 커뮤니티(실제 운영 데이터, 글 0개) | 전체: "아직 올라온 글이 없어요 · 로그인하고 첫 글을 남겨보세요" / 또래: "…전체 보기로…" |
| `#auth-email` (커뮤니티) | 0개 — 모달 핫픽스 유지 |
| 신청 코드가 본문 `contact` 에 쓰는지 | 0 (단계 C 와 충돌 없음) |

제출(가입 완료)은 누르지 않았습니다.

## 4. 배포 후

```bash
curl -s https://adultryun188-lang.github.io/dadamom-app/index.html | sha256sum   # 53a75433…
```
- 실제 가입 1건 → `consent_records` 에 `signup_*` 4행
- 커뮤니티 비로그인 빈 화면 문구

## 5. 되돌리기

코드 `93ef1209` 재배포. DB `0012` 는 `signup_*` 행 삭제 후 CHECK 원복(0012 파일 맨 아래).
단계 C 는 컬럼을 다시 만들어야 하나 **지운 컬럼은 비어 있었음**(1절) — 잃는 데이터 없음.

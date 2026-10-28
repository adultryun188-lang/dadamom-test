# DadaRound (나눔스퀘어라운드 줄인 판)

네이버 나눔스퀘어라운드에서 자주 쓰는 글자만 남겨 줄인 글꼴이다. 같은 출처에서 받아 외부 글꼴 서버가 느려도 영향이 없다.

- 원본 배포처: https://hangeul.naver.com/font (`https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/`)
- 라이선스: SIL Open Font License 1.1. 같은 폴더의 `OFL.txt` 참조.
- 공식 저작권 안내: https://help.naver.com/service/30016/contents/18088?osType=PC&lang=ko

## 줄인 방법 (2026-10-28)

- 남긴 글자: 완성형 한글 2,350자 + 앱 화면 파일(index·community·약관 등)에 나오는 모든 글자 + 영문·숫자·기호.
- 크기: R 241→183KB, B 226→169KB, EB 221→164KB.
- OFL 3조: 고친 글꼴은 예약된 이름(NanumSquareRound)을 못 쓴다 → 글꼴 이름을 `DadaRound` 로 바꿨다.
- 없는 드문 글자(예: 똠, 햏)는 `rounded-ui.css` 의 시스템 대체 글꼴로 보인다.
- 다시 만들 때: 화면에 새 글자가 많이 늘면 원본(git 기록의 `NanumSquareRound*.woff2`, 커밋 41bc2b3)으로 fontTools subset 을 다시 돌린다.

원본 SHA-256:

- R: `3127EB6B4CF10A0A840D204D613F610BBBD7F8A7CE82C0F81D04713760F81758`
- B: `4E8692A08D6C323F1BFFB3641C7276D9C4BC8FA2891D78B02ACC972776228600`
- EB: `31257CEFDD0CEC677B8278086E1D43FDFFFB004AB40F96BD1ACEDA2E8D2F8E42`

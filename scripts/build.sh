#!/usr/bin/env bash
# 환경을 골라 env.js 를 만든다. 번들러 없이 파일 복사만 한다.
#
#   ./scripts/build.sh dev        로컬 개발
#   ./scripts/build.sh staging    테스트 배포 (기본값)
#
# 운영(production)은 이 저장소에서 빌드하지 않는다. 운영 배포는 docs/PROMOTION.md 참고.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV="${1:-staging}"
case "$ENV" in
  dev|development) SRC=config/env.development.js ;;
  staging)         SRC=config/env.staging.js ;;
  production|prod)
    echo "이 저장소에서는 운영 빌드를 만들지 않습니다. docs/PROMOTION.md 를 보세요." >&2
    exit 1 ;;
  *) echo "사용법: $0 [dev|staging]" >&2; exit 1 ;;
esac

BUILD="$(date -u +%Y%m%d-%H%M)"
sed "s/__BUILD__/${BUILD}/g" "$SRC" > env.js

echo "환경: ${ENV}"
echo "빌드: ${BUILD}"
echo "생성: env.js  (커밋하지 않습니다)"
grep -o "SUPABASE_URL: '[^']*'" env.js

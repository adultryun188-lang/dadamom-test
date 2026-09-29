#!/usr/bin/env bash
# 로컬에서 테스트 앱을 띄운다.
#
#   ./scripts/serve.sh          http://localhost:8000
#
# 서비스워커는 https 또는 localhost 에서만 동작하므로 localhost 로 접속해야 한다.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f env.js ]; then
  echo "env.js 가 없어 dev 환경으로 만듭니다."
  ./scripts/build.sh dev
fi

PORT="${1:-8000}"
echo "http://localhost:${PORT} 에서 실행합니다. 종료는 Ctrl+C"
python3 -m http.server "$PORT"

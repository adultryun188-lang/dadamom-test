<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**This project has a knowledge graph. Start with the code-review-graph
MCP tools to narrow scope, then read the source.** The graph is cheaper than scanning files and
gives you structural context (callers, dependents, test coverage) that file search cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

### Verify in the source

- Narrow scope with the graph, then read the source. Do not change code from graph output alone.
- For any non-trivial change, read the implementation and the relevant tests before concluding.
- Verify the exact source when touching behavior, database logic, migrations, retries, fallbacks,
  recovery, or compatibility code.
- When the graph and the source disagree, the source wins. The graph may be stale or may not
  model that relationship.
- An empty graph result can mean "not indexed" or "not statically visible", not "does not exist".

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
<!-- /code-review-graph MCP tools -->

## 다다맘 작업 규칙 (Codex · Claude 공통)

> **지금 이어받을 일 (2026-10-16, Claude → Codex):** `docs/인수인계_2026-10-16.md` 0절 —
> 가족 공유 앱 코드는 작성 완료, `node tests/family_ui.mjs` 로 실제 테스트 DB 검증부터 하면 됩니다.

- **작업 전에 `CLAUDE.md` 를 먼저 읽고 그대로 따른다.** 이름은 Claude 용이지만 이 저장소 규칙의 원본이다.
  이어서 가장 최근 `docs/인수인계_*.md` 로 현재 상태를 확인한다.
- 절대 규칙 요약 (자세한 건 `CLAUDE.md` 0장):
  - 운영 앱(`dadamom-app`)과 운영 Supabase(`hjqchbpxwviengdzvado`)는 직접 수정·배포하지 않는다.
    운영 이관은 `docs/PROMOTION.md` 절차 + 사용자 승인을 거친다.
  - 작업 브랜치는 `staging`. `main` 에 직접 커밋하지 않는다.
  - 운영 키·비밀키를 코드나 저장소에 넣지 않는다.
- **작업 폴더는 이 폴더 하나다:** `C:\Users\eodls\Desktop\코덱스 저장소\dadamom-test`
  `Documents\ChatGPT\어플계획\dadamom-test` 는 2026-10-09 에 멈춘 옛 복사본이라 쓰지 않는다.
  거기서 하던 0013 search_path 작업은 이 폴더의 `0013_fix_search_path.sql` 로 이미 운영·테스트에 적용됐다(2026-10-14).
- Claude 와 Codex 가 이 폴더를 번갈아 쓴다. 서로의 대화 기록은 못 보므로 **기록은 파일로 넘긴다**:
  작업 단위마다 커밋하고, 운영 반영과 중요한 결정은 인수인계 문서에 남긴다.
- 시작 전에 `git status` 로 다른 쪽이 남긴 미커밋 변경을 확인하고, 그 파일은 덮어쓰지 않는다.
- 새 마이그레이션은 `supabase/migrations/` 의 마지막 번호를 확인하고 다음 번호를 쓴다.

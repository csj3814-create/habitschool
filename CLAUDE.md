# CLAUDE.md

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- Verification commands for this project:
  - `[replace with actual test command]`
  - `[replace with actual build command]`

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 7. Context Management
- At 70%+ context: run /compact before continuing
- Start a fresh session for unrelated tasks — don't pile into one
- Long-running tasks: use subagents to keep main context clean

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## 배포 규칙 (절대 준수)

### 배포 순서
1. `git add` + `git commit`
2. `git push origin main`
3. **배포 대상 확인** — 아래 "무엇을 배포해야 하는가" 참조
4. **사용자에게 확인 요청** ← 이 단계 없이 firebase deploy 절대 금지
5. 확인 받은 후에만 `firebase deploy --only hosting,functions`

### 무엇을 배포해야 하는가 (배포 전 매번 확인)

지난 배포 이후 바뀐 파일로 대상을 정한다. 코드만 올리고 규칙을 두고 오면
새 필드 쓰기가 전부 `permission-denied` 로 조용히 거부된다.

```bash
git diff --name-only <마지막_배포_커밋>..HEAD -- functions/ firestore.rules storage.rules firestore.indexes.json
```

| 바뀐 파일 | 배포 대상 |
|---|---|
| `js/`, `*.html`, `*.css` | `--only hosting` |
| `functions/` | `--only functions` |
| **`firestore.rules`** | **`--only firestore:rules`** ← 별도 승인 필요 |
| `storage.rules` | `--only storage` ← 별도 승인 필요 |
| `firestore.indexes.json` | `--only firestore:indexes` ← 별도 승인 필요 |

**파일에 적는 것과 배포하는 것은 다른 일이다.** `firestore.rules` 에 필드를 추가한
커밋이 배포 범위에 들어 있으면, hosting/functions 만 올리고 끝내지 말고 규칙 배포
승인을 따로 받는다.

배포된 규칙이 파일과 같은지는 이렇게 확인한다 (서비스 계정 자격증명 필요):

```
firebaserules.googleapis.com/v1/projects/{project}/releases/cloud.firestore
→ rulesetName → /v1/{rulesetName} 의 source.files[].content 를 로컬 파일과 비교
```

> 2026-08-15: `consents` 를 화이트리스트에 넣은 커밋(08-11)이 배포되지 않아,
> 그 뒤 나흘간 모든 동의 기록 쓰기가 `permission-denied` 로 거부됐다.
> 전체 회원 562명 중 동의 기록을 가진 사람이 0명이었다.
> 가입 경로의 쓰기가 `.catch(() => {})` 로 감싸여 있어 거부가 성공처럼 보였고,
> 재동의 화면이 실패를 보고하기 전까지 아무 신호도 없었다.
> **오류를 삼키는 catch 는 이런 종류의 침묵을 만든다. 최소한 로그는 남길 것.**

### Staging 배포 단축 승인
- 사용자가 `스테이징` 또는 `staging`이라고 말하면 staging Hosting 및 Functions 배포의 최종 확인으로 간주한다.
- 필요한 변경을 커밋하고 `origin/main`에 푸시한 뒤 추가 확인 없이 `firebase deploy --project staging --only hosting,functions`까지 즉시 진행한다.
- 이 단축 승인은 staging Hosting 및 Functions에만 적용하며 운영 배포나 Firestore/Storage 규칙·인덱스 배포로 확대하지 않는다.

### Gemini API
- **gemini-2.0-flash 사용 금지** — deprecated됨
- 반드시 `gemini-2.5-flash`만 사용
- thinking 불필요한 작업: `thinkingConfig: { thinkingBudget: 0 }`

### Firebase SDK
- 프로젝트 전체 버전: `10.8.0` — 다른 버전 동적 import 금지
- 이미 top-level에서 import된 모듈을 재사용할 것

### 새 기능 추가 시 인프라 체크
- 새 Storage 경로 → `storage.rules`에 규칙 추가 **+ 배포**
- 새 Firestore 필드 → `firestore.rules` 화이트리스트에 추가 **+ 배포**
- 새 Cloud Function → 배포 후 실행 로그 확인
- **규칙 파일 수정은 절반이다.** 배포해야 적용된다. 위 "무엇을 배포해야 하는가" 참조.
- 새 필드를 쓰는 코드는 **쓰기 성공 여부를 확인할 수 있어야 한다.** 첫 저장 뒤
  콘솔이나 Firestore에서 실제로 들어갔는지 한 번 본다 — 규칙이 막고 있어도
  화면은 멀쩡해 보인다.

### 작업 완료 검증
- 면밀하게 분석 후 배포 — 단순하게 생각해서 실수하지 말 것
- 에러 발생 시 근본 원인까지 완벽히 해결
- 해결했다고 보고하기 전에 실제 동작 확인

---

## Session Start Checklist

- [ ] Review `tasks/lessons.md` for patterns relevant to this project
- [ ] Write `tasks/todo.md` before starting any task
- [ ] Confirm verification method (test command, browser, etc.)
- [ ] Check if context is near limit — if so, start fresh or /compact

---

*Update this file whenever a correction happens.*

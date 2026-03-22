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
3. **사용자에게 확인 요청** ← 이 단계 없이 firebase deploy 절대 금지
4. 확인 받은 후에만 `firebase deploy --only hosting,functions`

### Gemini API
- **gemini-2.0-flash 사용 금지** — deprecated됨
- 반드시 `gemini-2.5-flash`만 사용
- thinking 불필요한 작업: `thinkingConfig: { thinkingBudget: 0 }`

### Firebase SDK
- 프로젝트 전체 버전: `10.8.0` — 다른 버전 동적 import 금지
- 이미 top-level에서 import된 모듈을 재사용할 것

### 새 기능 추가 시 인프라 체크
- 새 Storage 경로 → `storage.rules`에 규칙 추가
- 새 Firestore 필드 → `firestore.rules` 화이트리스트에 추가
- 새 Cloud Function → 배포 후 실행 로그 확인

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
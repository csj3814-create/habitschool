# AGENTS.md

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for any non-trivial task that involves 3 or more steps or architectural decisions.
- If something goes sideways, stop and re-plan immediately. Do not keep pushing blindly.
- Use plan mode for verification steps, not just implementation.
- Write detailed specs up front to reduce ambiguity.

### 2. Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis when appropriate.
- For complex problems, increase parallel analysis instead of overloading the main thread.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop
- After any correction from the user, update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review lessons at session start for patterns relevant to the current task.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between `main` and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, and demonstrate correctness.
- Verification commands for this project:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

### 5. Demand Elegance (Balanced)
- For non-trivial changes, pause and ask whether there is a more elegant way.
- If a fix feels hacky, restart from the cleaner design.
- Skip this for simple, obvious fixes. Do not over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing
- When given a bug report, fix it without requiring hand-holding.
- Use logs, errors, and failing tests to drive the fix.
- Minimize context switching for the user.
- Resolve failing checks and broken flows end to end.

### 7. Context Management
- At 70%+ context, compact or split work into a fresh session if appropriate.
- Start a fresh session for unrelated tasks.
- For long-running tasks, keep the main context clean.

---

## Task Management

1. **Plan First**: Write a plan to `tasks/todo.md` or a same-day task note with checkable items.
2. **Verify Plan**: Check in before starting implementation.
3. **Track Progress**: Mark items complete as you go.
4. **Explain Changes**: Give a high-level summary at each step.
5. **Document Results**: Add a review section to the task note.
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections.

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible and keep impact narrow.
- **No Laziness**: Find root causes. Do not ship temporary fixes.
- **Minimal Impact**: Touch only what is necessary and avoid introducing regressions.

---

## 배포 규칙

### 배포 순서
1. `git add` + `git commit`
2. `git push origin main`
3. 사용자에게 배포 확인 요청
4. 확인 받은 후에만 `firebase deploy --only hosting,functions`

### Gemini API
- `gemini-2.0-flash` 사용 금지
- 반드시 `gemini-2.5-flash`만 사용
- thinking 불필요한 작업은 `thinkingConfig: { thinkingBudget: 0 }`

### Firebase SDK
- 프로젝트 전체 버전은 `10.8.0`
- 다른 버전 동적 import 금지
- 이미 top-level에서 import된 모듈을 재사용할 것

### 새 기능 추가 시 인프라 체크
- 새 Storage 경로는 `storage.rules`에 규칙 추가
- 새 Firestore 필드는 `firestore.rules` 화이트리스트에 추가
- 새 Cloud Function은 배포 후 실행 로그 확인

### 작업 완료 검증
- 면밀하게 분석 후 배포할 것
- 에러 발생 시 근본 원인까지 해결할 것
- 해결했다고 보고하기 전에 실제 동작을 확인할 것

---

## Session Start Checklist

- [ ] `tasks/lessons.md`에서 관련 패턴 검토
- [ ] 시작 전에 `tasks/todo.md` 또는 당일 작업 문서 작성
- [ ] 테스트/브라우저 검증 방식 확인
- [ ] 컨텍스트 한계가 가까우면 정리 후 진행

---

이 문서는 사용자 교정이 생길 때마다 갱신한다.

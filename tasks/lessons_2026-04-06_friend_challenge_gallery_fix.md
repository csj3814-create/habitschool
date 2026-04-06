## 2026-04-06 Friend Challenge / Gallery Friend Fix

- Shared optimistic update helpers must not reference page-local variables like `userData`; use explicit parameters or stable auth/profile helpers instead.
- Empty/error states should reflect the real next action. If the likely issue is missing friend connections, prefer a single friend-related CTA over generic duplicate retry buttons.

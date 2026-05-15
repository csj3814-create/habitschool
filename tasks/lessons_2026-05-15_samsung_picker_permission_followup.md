# 2026-05-15 Samsung picker permission follow-up

- If Android/Samsung Internet needs the native "Recent images" screen, prefer `showOpenFilePicker()` when available even if the browser first asks for permission. The important guard is not to auto-fallback after a denial, because async input clicks can lose user activation and produce confusing picker sheets.
- For mobile media bugs, separate three states in the UI and code: picker denied/cancelled, selected-but-uploading, and saved-with-background-upload. A 0% inline progress surface should become an explicit delayed-upload state before the user thinks the save failed.

# 2026-05-15 Chrome picker regression

- Do not use `showOpenFilePicker()` globally for Android image uploads. On Chrome Android, plain `input[type=file][accept=image/*]` can open the better Android image picker grid, while `showOpenFilePicker()` opens the Files recent list.
- When tuning provider picker behavior, split by concrete browser behavior, not by API availability alone.

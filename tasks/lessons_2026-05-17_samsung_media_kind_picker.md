# 2026-05-17 Samsung media-kind picker

- Samsung Internet picker behavior must be split by media kind. Image flows should use an image-only system picker, while video flows need a video-only system picker; a single generic file input cannot reliably produce the desired native surface.
- Keep Chrome Android out of Samsung-specific picker workarounds because Chrome's plain `image/*` input can be better than `showOpenFilePicker()` for photos.

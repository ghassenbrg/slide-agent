# 45-second LinkedIn announcement

Composition: `AnnouncementV5`, 1350 frames, 30 fps, 1080×1350. Source in this directory; previous cuts remain in announcement3 and out/.

The final edit follows the user's 45-second brief and draws motion references from slide-agent-launch.mp4, slide-agent-promo.mp4 and slide-agent-linkedin.mp4. See `promo/linkedin/CONCEPT-V5.md` for the analysis, scene timings and creative constraints.

## Rebuild from promo/

```sh
node scripts/make-announcement5-audio.mjs
npx tsc --noEmit
npx eslint src/announcement5 src/Root.tsx
npx remotion render src/index.ts AnnouncementV5 /tmp/slide-agent-announcement-v5-master.mp4 --codec=h264 --crf=17 --pixel-format=yuv420p --image-format=png --color-space=bt709 --audio-codec=aac --audio-bitrate=192k --concurrency=4 --x264-preset=medium
```

Measure the rendered mix and apply the documented final gain from `promo/linkedin/REVIEW.md`; enable faststart on the upload copy. `bgm: false` disables the score while retaining the edit accents for an alternate export.

Use slide 1 for every analytics appearance, including the opening and actual blue revision. Source assets come from the real showcase exports; the original architecture scene drives assembly and selection. NOVA is a fictional marketing presentation, not Slide Agent's interface. Assistant interaction and assembly are illustrated, not live generation timing.

Current upload: `promo/out/slide-agent-announcement.mp4`; versioned export: `promo/out/slide-agent-announcement-v5.mp4`.

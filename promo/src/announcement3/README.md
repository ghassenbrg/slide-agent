# Slide Agent LinkedIn announcement — V3

The current 60-second launch composition is `AnnouncementV3`, registered in `src/Root.tsx`. The earlier `Announce`, `LinkedIn`, and `Promo` compositions are preserved.

Creative analysis, copy and QA: `../../linkedin/` (`promo/linkedin/`).

## Preview / export

Run from `promo/`:

```sh
npm run dev
node scripts/make-announcement3-audio.mjs
npx tsc --noEmit
npx eslint src/announcement3 src/Root.tsx
npx remotion render src/index.ts AnnouncementV3 /tmp/slide-agent-announcement-v4-master.mp4 --codec=h264 --crf=17 --pixel-format=yuv420p --image-format=png --color-space=bt709 --audio-codec=aac --audio-bitrate=192k --concurrency=4 --x264-preset=medium
ffmpeg -y -i /tmp/slide-agent-announcement-v4-master.mp4 -map 0:v:0 -map 0:a:0 -c:v copy -af volume=-1.39dB -c:a aac -b:a 192k -ar 48000 -movflags +faststart out/slide-agent-announcement-v4.mp4
```

The attenuation above was measured for this mix; remeasure after changing the audio. Keep the master separate from the final output to avoid applying attenuation twice.

Actual slide exports are copied into `public/announcement3/` from `site/public/showcase/presentations/`. Architecture page 1 was re-rendered from its existing PDF at 3,200px for sharper close-ups. The selection overlay uses the original engine coordinates in `data/architecture.json`. Sample data is fictional; displayed presentation assets and native PPTX geometry are real.

Scene starts: 0, 4, 10, 15, 25, 31, 43 and 53 seconds. Seven 12-frame crossfades overlap 1,884 authored scene frames to produce 1,800 final frames. Each scene is registered separately for preview/editing.

Editorial preference: always use slide 1 of the analytics showcase PowerPoint for analytics examples, including the opening and the cover image.

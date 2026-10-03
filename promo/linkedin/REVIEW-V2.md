# Product announcement review — 2 October 2026

Final upload: `promo/out/slide-agent-announcement.mp4`.
Versioned preview of the same file: `promo/out/slide-agent-announcement-v2.mp4`.
Post text: `promo/linkedin/POST.txt`.
Previous showcase-led cut: `promo/out/archive/slide-agent-announcement-showcase-cut-60s.mp4`.

## Creative correction

The previous cut dedicated 25 seconds to separate genre tours. This cut introduces Slide Agent immediately and follows one brief through a presentation workflow. The range of showcase styles has a five-second supporting role. The product, user interaction and output now form the narrative.

## Final storyboard

| Time | Purpose |
|---|---|
| 0–4 | Introducing Slide Agent: brief → editable PowerPoint, visible from frame zero |
| 4–11 | Describe the presentation and supply notes/metrics |
| 11–18 | Shape a coherent five-slide story and an editorial design language |
| 18–27 | Slide Agent builds the assistant's design with real computed geometry |
| 27–33 | Native text/chart selection and embedded chart data |
| 33–39 | Ask for a design revision; see an actual rebuilt blue version |
| 39–44 | Brief supporting proof of different presentation genres |
| 44–54 | Accurate VS Code / CLI setup alternatives |
| 54–60 | Try Slide Agent; code, documentation and installation links |

## Real product evidence

The main example is the existing `promo/showcase/presentations/analytics/` five-slide presentation. Its computed scene, story beats, design language and rendered thumbnails drive the demonstration. The range scene uses the real covers of the five standalone showcase presentations.

The refinement is real: the CLI applied design-level EditOps to the analytics deck's three coral palette tokens, rebuilt all five slides and finalized the revised deck. Final state: `ready`. The only minor finding is the LibreOffice embedded-font preview note. Source and revision remain separate.

For inspection:
- Original: `promo/out/analytics-original.pptx`.
- Revision: `promo/out/analytics-blue-revision.pptx`.
- Operations and verdicts: `promo/announce/demo/`.

The conversation and assembly are labelled illustrative. They demonstrate the supported workflow rather than claiming this is a recorded AI session or that generation completes in the on-screen time. The source material shown in the film is saved as `brief.md`, `notes.md` and `metrics.csv` under `promo/announce/demo/`.

## Verification

- TypeScript and ESLint passed for the affected Remotion source.
- Studio preview loads without a current error; the composition is 1,800 frames, 30 fps, 1080×1350.
- Inspected twelve key frames at feed scale and full-size brief, outline and revision scenes. Fixed the wrapping of the final outline label. Reviewed the full export's scene contact sheet.
- Full render completed. Final MP4 decoded without reported FFmpeg errors.
- H.264, yuv420p, limited-range BT.709; stereo AAC, 48 kHz, 192 kb/s. Video duration exactly 60 seconds. Fast-start metadata enabled. AAC adds roughly 0.01 seconds to container duration.
- Final mix measured -16.03 LUFS integrated, -5.64 dBTP true peak. File size: 5,936,239 bytes.
- Installation copy remains aligned with the published package and quickstart checked earlier in this session. Documentation and Marketplace links are in the post. The unverified custom domain is not advertised.
- No personal-authorship language or unreleased Poquito/Pockito branding in the video. The LinkedIn post retains personal authorship.

This is a review copy. No LinkedIn post or website deployment was published.

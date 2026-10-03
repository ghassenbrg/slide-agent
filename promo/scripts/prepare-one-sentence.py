"""Prepare real Slide Agent output for the One Sentence film.

- Rasterises the LibreOffice-rendered PDFs (what the .pptx looks like) at 216 dpi.
- Exports each used slide's element frames (inches) from the engine's scene.json,
  so crops, reveals and camera targets land on the slide's true geometry.
Nothing here alters the decks; the film only animates these pixels.
"""
import json, pathlib, shutil, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUB = ROOT / 'public/one-sentence'
SLIDES = PUB / 'slides'
SLIDES.mkdir(parents=True, exist_ok=True)
SHOW = ROOT / 'showcase/presentations'
DECKS = {
    'fern': (ROOT / 'one-sentence/deck/out', [1, 2, 3, 4, 5]),
    'architecture': (SHOW / 'architecture/out', [1]),
    'transformation': (SHOW / 'transformation/out', [1]),
    'analytics': (SHOW / 'analytics/out', [1, 2]),
}
DPI = 216

geometry = {}
for name, (out, pages) in DECKS.items():
    pdf = out / 'render/deck.pdf'
    scene = json.loads((out / 'scene.json').read_text())
    for p in pages:
        target = SLIDES / f'{name}-{p}'
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-f', str(p), '-l', str(p), '-singlefile', str(pdf), str(target)], check=True)
        sl = scene['slides'][p - 1]
        els = []
        for e in sl['elements']:
            if e.get('id', '').find('texture') >= 0:
                continue
            text = ''
            if e['kind'] == 'text':
                text = ' '.join(r.get('text', '') for para in e.get('paragraphs', []) for r in para.get('runs', []))
            els.append({'id': e['id'], 'kind': e['kind'], 'text': text[:80], 'frame': e['frame']})
        geometry[f'{name}-{p}'] = {'size': scene['size'], 'elements': els}
        print(name, p, len(els))

(ROOT / 'src/one-sentence').mkdir(parents=True, exist_ok=True)
(ROOT / 'src/one-sentence/geometry.json').write_text(json.dumps(geometry, indent=1))
shutil.copy(ROOT.parent / 'images/icon.png', PUB / 'icon.png')
shutil.copy(ROOT / 'one-sentence/deck/out/deck.pptx', PUB / 'Fern-launch-plan.pptx')

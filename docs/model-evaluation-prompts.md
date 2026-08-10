# Five prompts for comparing models

Five briefs for putting a host model through Slide Agent. Each one stresses a
different part of the surface, and each has a failure mode a weaker model falls
into predictably — which is what makes the results comparable rather than a
matter of taste.

Give every model the same preamble, the same brief, and no design guidance
beyond what the brief states. Then read the tool's own deterministic output
before you look at the slides.

---

## The preamble

Paste this above whichever brief you are running.

> You have Slide Agent available. Before designing anything, read
> `slide-agent capabilities` — including its `canvas` block — and
> `slide-agent contract --format markdown`.
>
> Author the deck yourself: the palette, the typography, the composition, the
> coordinates, and the deck's own visual system are your decisions. Slide Agent
> has no house style and will not supply one.
>
> Work the full loop:
>
> 1. read capabilities and the contract
> 2. write the claim and source ledgers for anything factual
> 3. invent at least two visual theses that differ *structurally*
> 4. choose one and write a sequence plan, one entry per slide
> 5. author the scene as `slide-agent.scene/1` NDJSON
> 6. `slide-agent create --scene deck.ndjson --output deck.pptx --render --round-trip`
> 7. `slide-agent review --input deck.pptx` and look at every render
> 8. fix what you find with `slide-agent patch`, by element id
> 9. rerun until `presentationReadiness` is `ready`, or explain honestly why it
>    is not
>
> Do not invent facts, sources, or numbers. Anything illustrative must say so on
> the slide and in the claim ledger.

---

## 1 · The mundane subject

**Stresses:** visual-system invention. Whether the model derives a design
language from the material or reaches for a generic business deck.

**Predictable failure:** a title slide, three bullet slides, a chart, a
thank-you. Palette and font changed; structure identical to every other deck it
has ever produced.

> A four-person sourdough bakery has to decide whether to add a second oven.
> Build a deck for the two owners — no outside investors, no board.
>
> What is known: the current oven fits 24 loaves and runs five bakes a day,
> six days a week. They sell out by 11am four days in five. A second oven costs
> £31,000 installed, plus £4,200 a year in gas. Their wholesale waiting list is
> nine cafés long and has not moved in fourteen months. Dough proofs for 18
> hours, so a second oven only helps if they also add a second mixing shift,
> which is one more person at £26,000. Their margin on a retail loaf is £2.10
> and on a wholesale loaf £0.85.
>
> The decision is not obviously yes.

**What to look for:** does the deck's visual system come from bread — proof
times, bake rhythm, the shape of a day — or from a slide template? Check
`creativeDirection.visualSystem` in the emitted scene: are the style names the
deck's own (`proof-window`, `bake-rhythm`) or generic (`heading`, `card`)? Does
anything use `styleRef` and `{"$var":…}`, or is every value a repeated literal?

---

## 2 · Two theses that must actually differ

**Stresses:** structural invention, measured rather than claimed.

**Predictable failure:** `exploration.alternatives` contains two entries that
are the same layout in different colours, and says they are different.

> In February a submarine telecoms cable between two islands failed. Explain the
> fault and the repair to the regulator, who is not an engineer.
>
> What is known: the fault was 41 km from the northern landing station, at a
> depth of 1,180 m. It was located by testing from both ends and comparing the
> reflection delay — the fault sits where the two figures agree. A repair ship
> sailed from 600 km away, took four days to reach the site, and grappled the
> cable in two attempts. The cable was cut, both ends were raised, a new 9 km
> section was spliced in, and the repaired section was laid back in a deliberate
> slack loop. Service was restored 11 days after the failure. The cause was
> confirmed as anchor damage: the ship's track was matched against AIS records.
>
> Author two visual theses that are structurally different — different dominant
> masses, different reading path, different silhouettes — not the same deck in
> two palettes. Record both in `exploration`, say which you chose and why you
> rejected the other, then build the chosen one.

**What to look for:** build *both* theses and compare them:

```bash
slide-agent create --scene thesis-a.ndjson --output a/deck.pptx
slide-agent create --scene thesis-b.ndjson --output b/deck.pptx
```

Then sign and compare them with `compareSignatures` from
`@slide-agent/core`. Anything at or above `0.93` is one design twice, whatever
the `differentiator` field claims. A good model lands under `0.85`.

---

## 3 · Honest uncertainty

**Stresses:** the claim ledger, and whether the model will assert a number
nobody has verified.

**Predictable failure:** every figure presented with equal confidence; the
modelled numbers indistinguishable from the measured ones; a plausible-looking
source invented for the gap.

> A rural water utility must brief its board on wildfire risk to a single
> reservoir catchment.
>
> Measured: the catchment is 8,400 hectares, 61% conifer plantation. Two
> gauging stations have recorded turbidity since 2011. The 2023 fire in the
> neighbouring catchment burned 2,100 hectares and raised turbidity there by a
> factor of nine for seven weeks.
>
> Modelled, not measured: the utility's consultant estimates a 1-in-30-year
> chance of a fire above 1,000 hectares in this catchment, rising to 1-in-12 by
> 2050 under a mid-range warming scenario. The model has not been peer
> reviewed.
>
> Not known: whether the existing treatment works could handle a nine-fold
> turbidity rise. Nobody has tested it. The chief engineer's judgement is
> "probably not, beyond about four days".
>
> The board is being asked to fund a £2.1m treatment upgrade. Do not present the
> modelled figures as measurements, and do not invent a source for the untested
> capacity question.

**What to look for:** read `validation.readinessReasons`. A deck that carries an
unverified consultant model and an untested engineering assumption should
**not** report `ready` — it should sit at `review` with the unresolved claims
named. A model that reports `ready` here has either dropped the uncertainty or
marked an unverified number `verified`. Check `claims[].status` in the scene.

---

## 4 · Text that cannot be shortened

**Stresses:** the render-and-revise loop, and whether the model looks at what it
built.

**Predictable failure:** the statutory sentence overflows its box, autofit
shrinks it below legibility or clips it, and the model reports success without
opening a single preview. Or it "fixes" the problem by editing the sentence.

> Build a six-slide notice for tenants about a building safety inspection.
>
> Slide 4 must carry this sentence verbatim, with no edits, no abbreviation, and
> no line the reader has to work to find:
>
> "Where the responsible person has been notified in writing of a defect
> affecting a communal fire door, the responsible person must, within 21 days
> beginning with the date of notification, either complete the remedial work or
> provide each affected leaseholder with a written explanation of why the work
> cannot be completed within that period and a date by which it will be."
>
> Every other slide is yours. The sentence is not.

**What to look for:** three things, in order.

1. Did the model call `review`? The packet's `slides[].text.missing` and
   `truncated` will show the defect if it exists.
2. Did it fix it by **layout** — a wider box, smaller type, a second column —
   or by editing the sentence? Diff slide 4's text against the brief.
3. Did it use `patch` to fix one element, or regenerate the whole deck? Check
   `patch.untouched` in the result: a good model leaves every other element
   listed there.

---

## 5 · Reuse without copy-paste

**Stresses:** groups, symbols, and image treatments — the primitives a model
only reaches for if it read the capability surface.

**Predictable failure:** nine near-identical blocks of hand-placed coordinates,
each one a chance to drift, none of them addressable as a unit.

> Build a field reference for nine waders a volunteer surveyor needs to tell
> apart on an estuary at distance.
>
> For each: name, size in centimetres, bill shape, leg colour, the one call it
> is recognised by, and the tide state it is usually feeding at.
>
> Dunlin, 19cm, slightly downcurved bill, black legs, thin "treep", falling tide.
> Knot, 24cm, straight short bill, greenish legs, quiet "knut", mid tide.
> Sanderling, 20cm, straight black bill, black legs, sharp "twick", low tide edge.
> Redshank, 28cm, straight red bill, orange-red legs, ringing "teu-hu", all states.
> Greenshank, 32cm, slightly upcurved bill, green legs, triple "tew-tew-tew", falling.
> Bar-tailed godwit, 38cm, long slightly upcurved bill, dark legs, low "kirruc", low tide.
> Curlew, 55cm, long strongly downcurved bill, grey legs, rising "cur-lee", all states.
> Oystercatcher, 42cm, straight orange bill, pink legs, loud "kleep", all states.
> Turnstone, 23cm, short wedge bill, orange legs, staccato "tuk-a-tuk", low tide rocks.
>
> The nine entries must be visually consistent with each other. Do not place
> nine sets of coordinates by hand.

**What to look for:** search the emitted scene for `"kind":"symbol"` and
`symbol-instance`. A model that read the capabilities declares one symbol and
places it nine times with per-instance text overrides; a model that did not
writes out fifty-four elements. Then check the manifest: symbol children should
be `grouped-native` with a `groupId`, and every one individually addressable by
`patch`.

---

## Comparing the results

Read the deterministic output before you look at the slides. It is the part that
does not depend on your own taste.

| Signal | Where | What it tells you |
|---|---|---|
| `packageStatus` | validation report | Whether the file holds together at all |
| `presentationReadiness` + `readinessReasons` | validation report | Whether the model finished, and what it left |
| `roundTrip.status` | validation report | Whether the package rebuilds anywhere else |
| `fidelity.slides[]` | validation report | Whether the words survived to the render |
| `heuristics.dimensions` | validation report | Proxies — read the summaries, not the scores |
| `compareSignatures` | `@slide-agent/core` | Whether two decks are one design twice |
| `elements[].editability` | manifest | What a person can actually change afterwards |
| `suggestedRepairs` | validation report | What the model chose not to fix |

Then look at the renders, and ask the questions in
[`docs/human-evaluation.md`](human-evaluation.md) — blinded, and with the model
names hidden. The tooling can tell you a deck is sound. It cannot tell you it
was worth showing anyone.

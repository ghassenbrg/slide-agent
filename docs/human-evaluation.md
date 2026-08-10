# Human evaluation

Structural diversity is measurable and `npm run examples:evaluate` measures it.
"Does this look premium, and does it look designed for *this* subject?" is not,
and it is the question that decides whether the release did anything.

This is the protocol for answering it. It calibrates the release. It is
deliberately **not** wired into runtime validation: a deck does not pass or fail
because reviewers liked it, and no score from this ever reaches the report.

---

## Who reviews

Two panels, recruited separately and never shown each other's answers.

- **Presentation designers** — at least five, each with professional experience
  producing decks for external audiences. They answer the craft questions.
- **Target-audience readers** — at least five per deck, matched to that deck's
  stated audience: a platform engineer for the architecture deck, a buyer for
  the launch deck, a first-year student for the limnology deck. They answer the
  usefulness questions.

Record each reviewer's background before they see anything. It is the only way
to read a split result later.

---

## Blinding

- Shuffle deck order per reviewer.
- Strip engine and version metadata from every file shown.
- Remove the speaker notes, the validation report, and the scene: reviewers see
  what an audience sees, which is the rendered slides.
- Do not tell reviewers the decks came from one tool. That is the single
  strongest source of bias here — a reviewer told to look for a shared template
  will find one.
- Include at least two decoy decks made by human designers, unlabelled. If
  reviewers cannot tell the showcase decks from the decoys on subject-fit, that
  is the result worth reporting.

---

## Questions

Asked separately, in this order, one deck at a time. Craft and content are asked
apart on purpose: a beautiful deck about nothing and an ugly deck full of
substance both score badly on an averaged question and for opposite reasons.

1. **Does this look premium?** (1–5)
2. **Does it feel designed for this subject?** (1–5)
3. **Is the reading path clear?** (1–5)
4. **Is the visual evidence meaningful — is anything shown doing work a
   sentence could not?** (1–5)
5. **Does it look like the same tool or template as the other decks you have
   seen today?** (yes / no / unsure — and if yes, *what* made you think so)
6. **Would you present this without redesigning it?** (yes / with minor edits /
   no)

Question 5's free text is the most useful field in the whole protocol. "They all
use the same left margin" is actionable; a score of 3.4 is not.

---

## Release thresholds

For each showcase deck:

- at least **70%** of reviewers rate it **4/5 or better** for subject-fit
  (question 2) and craft (question 1);
- at least **60%** answer question 6 with **yes** or **with minor edits**;
- no more than **30%** answer question 5 with **yes** for any pair of decks.

A deck that misses a threshold is redesigned, not re-scored. Rerunning the panel
on the same deck until it passes measures the panel, not the deck.

---

## Recording

Preserve the raw per-reviewer responses, including the free text, in
`examples/showcase/human-evaluation/<date>.json`. Publish the aggregate criteria
and thresholds alongside the release examples, and publish the aggregate results
whether or not they met the bar.

A release note that reports only the passing numbers is the same failure this
whole release was about: claiming a result the evidence does not support.

# Migrating to Slide Agent 1.0

Most 0.x usage keeps working. Five changes need attention.

## 1. Skills are no longer registered by `npm install`

**What changed.** The package defined a `postinstall` hook that wrote symlinks
into `~/.agents`, `~/.copilot`, `~/.claude`, and `~/.gemini`, each pointing
inside the consuming project's `node_modules`. Adding a library as a dependency
should not modify your home directory, and a global skill that points into one
project breaks as soon as that project moves.

**What to do.** Register explicitly, once:

```bash
slide-agent install
```

`slide-agent doctor` detects registrations left by 0.x that point into a
`node_modules` directory and tells you to re-run the installer.

You can also drop the `allowScripts` entry the old README asked for — there are
no lifecycle scripts left to approve.

## 2. Remote image URLs are refused by default

**What changed.** A canvas is model-authored and frequently derived from
untrusted input, so fetching arbitrary URLs was a way to probe internal
services and carry the response into a shared deck.

**What to do.** If you rely on remote images, opt in per request:

```jsonc
{ "command": "create", "allowRemoteAssets": true, /* … */ }
```

or globally with `SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1`. Narrow further with
`SLIDE_AGENT_ALLOWED_IMAGE_HOSTS=images.example.com,cdn.example.com`.

Private, loopback, and link-local addresses stay blocked in every mode. If you
were pointing at an internal host, download the file first and pass a local
path.

## 3. Outlines are validated

**What changed.** `CreateRequest.outline` was typed `z.unknown()`, so a
malformed outline crashed deep inside the builder. It is now validated against
the published contract.

**What to do.** Nothing, if your outlines were well-formed. If a request now
fails, the error names the field:

```
outline does not satisfy the Slide Agent authoring contract:
  slides[2].canvas[0].w: Invalid input: expected number, received string
```

Two rules that were previously unenforced now reject:

- every chart series must have exactly one value per category label;
- a pie chart takes exactly one series.

Extra fields you add for your own reasoning are still preserved —
`creativeDirection`, `slides`, `communication`, and `completeness` are all open
objects.

## 4. `create --prompt file.json` is deprecated

**What changed.** It silently discarded `render`, `maxRetries`, and the path
overrides. It now merges correctly and warns on stderr.

**What to do.** Use the command intended for structured requests:

```bash
slide-agent run --request request.json
```

`--prompt` with a `.json` file will be removed in 2.0.

## 5. Prompt-only decks are labelled drafts

**What changed.** Prompt-only generation used to invent comparison points, KPI
figures, and process steps — the same ones for every deck. It now emits your
topics with bracketed placeholders where evidence belongs, and sets
`metadata.provenance` to `template-draft`.

**What to do.** If you were shipping prompt-only output, you were shipping
invented content. Move to the authored path:

```bash
slide-agent contract --format prompt > guide.txt   # give this to your model
slide-agent run --request whatever-it-returns.json
```

If you specifically want the old behaviour, there is no flag for it. Inventing
evidence and presenting it as researched is not something the tool should do.

## Smaller behavioural changes

| Change | Effect |
|---|---|
| `unsupported-font` demoted to `info` | Decks that reported `warning` may now report `pass` |
| Unknown slide `kind` falls back instead of throwing | Builds that failed now succeed with a warning |
| Fixable errors the repair loop cannot fix become warnings | `status` may be `warning` where it was `error`; check `validation.issues[].unfixedReason` |
| `validation.quality` added | New advisory field; no existing field changed |
| Accessibility issues added | `missing-alt-text` is an **error**. Add `alt` to images and charts, or `role: "decorative"`. |
| Previews preserve aspect ratio | Non-16:9 previews change dimensions. Pass `preserveAspect: false` for the old behaviour. |
| `metadata.contractVersion` added | Pin against it if you generate outlines programmatically |

## Checking your migration

```bash
slide-agent doctor --deep      # proves generation works end to end
slide-agent validate --input your-deck.pptx
```

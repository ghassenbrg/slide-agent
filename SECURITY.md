# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or private-data leak. Use GitHub's **Security → Report a vulnerability** private reporting flow for `ghassenbrg/slide-agent`. Include the affected version, reproduction steps, impact, and any proposed mitigation.

## Supported releases

Security fixes target the latest published stable version. Older releases may receive a deprecation notice instead of a backport.

## Handling untrusted input

A deck intent, a presentation outline, a freeform canvas, and an NDJSON scene
are all model-authored, and a host model routinely builds them from material
Slide Agent cannot vouch for — a web page, a customer brief, a file in a
repository. Slide Agent therefore treats every path, URL, and instruction in a
request as untrusted.

The governing rule is that **a request may narrow a permission and never widen
one.** Authority comes from the operator who started the process, not from
whatever authored the deck.

- **Paths are confined to the workspace roots.** Every path in a request is
  resolved to its real location — following symlinks — and refused with
  `PATH_OUTSIDE_WORKSPACE` if it lands outside. Over MCP the roots come from the
  client's declared roots; on the CLI they default to the working directory;
  `SLIDE_AGENT_ROOTS` sets them explicitly.
- **Requests cannot run scripts.** A build script is imported into this process
  with its privileges, so a script arriving in a request is refused with
  `SCRIPT_REFUSED` unless the operator set `SLIDE_AGENT_ALLOW_SCRIPTS=1`. Run
  your own scripts yourself with `slide-agent build <script>`. An intent is
  declarative and cannot execute anything, which is the recommended path.
- **Remote assets are refused unless the operator allows them.**
  `SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1` turns fetching on. `allowRemoteAssets:
  false` in a request narrows that to nothing for the run; `true` does not grant
  it.
- **Font downloads are the same shape.** Off unless
  `SLIDE_AGENT_FONT_DOWNLOADS=1` or an explicit `slide-agent font --add`. Only
  `fonts.googleapis.com` and `fonts.gstatic.com` are contacted, every file is
  checked to be a real font, and its SHA-256 is recorded.
- **Even when enabled, private networks stay unreachable.** Loopback, RFC1918,
  link-local (including cloud metadata endpoints), carrier-grade NAT, and
  IPv4-mapped equivalents are refused before the request is made and re-checked
  after every redirect. DNS is then pinned to the address that passed that
  check, so a hostname cannot resolve once for the check and again for the
  fetch. `SLIDE_AGENT_ALLOWED_IMAGE_HOSTS` narrows this further to an explicit
  hostname allowlist.
- **Archives are opened under limits.** Every `.pptx`, `.potx`, and embedded
  workbook is read through bounded inflation: entry count, per-entry size, total
  size, and compression ratio. Every entry is inflated under the cap rather than
  trusting the size the header declares, so a zip bomb cannot lie its way past
  the check.
- **Subprocesses are bounded.** LibreOffice and Poppler run with a timeout, a
  capped output buffer, and a minimal environment built from an allowlist, and
  are killed as a process group — SIGTERM, then SIGKILL — so a hung child cannot
  outlive the run or leak the parent's environment.
- **Responses are bounded and verified.** A 10 MB cap is enforced while the body
  streams, requests time out after 10 seconds, redirects are limited to two, and
  the payload must be a real PNG, JPEG, GIF, or WebP by magic bytes — the
  `Content-Type` header is not trusted.
- **The asset cache is private.** It is per-user, mode `0700`, and
  content-addressed rather than named after the source URL.
- **Only local paths and `http(s)` URLs are accepted** for images. Other URL
  schemes are rejected.
- **Hyperlinks are held to an allowlist.** A deck may link to `http`, `https`,
  or `mailto`, or to another slide in the same deck. `file:`, `smb:`,
  `javascript:`, `data:`, and application-registered schemes are refused, and
  the refusal is reported as a build warning rather than dropped in silence.
  This applies to the contract's `link` field and to a `hyperlink` passed
  through `options` — the PptxGenJS passthrough is not a way around the check.

Installing the library runs no lifecycle scripts and writes nothing outside the
project. Agent-skill registration happens only when you explicitly run
`slide-agent install`.

Optional fidelity rendering shells out to LibreOffice and Poppler. Those run
against files you supply, under the subprocess limits above; discovery honours
`SLIDE_AGENT_SOFFICE` and `SLIDE_AGENT_PDFTOPPM` if you need to pin the
executables, and an explicit pin is used or nothing is — a typo reports the tool
as missing rather than quietly running a different binary. 2.x previews are
rendered in-process and shell out to nothing.

## Models

Slide Agent does not call a model. The host model that authors a deck runs in
the host, and Slide Agent only reads what it produced.

The single exception is engine-managed mode — `slides_generate` /
`slide-agent generate` — which calls the Anthropic API when
`ANTHROPIC_API_KEY` is set and the optional `@anthropic-ai/sdk` peer dependency
is installed. It sends the brief, the sources you named, and rendered previews
of the deck being built. Nothing else in the package makes a request to a model
provider, and no telemetry is collected anywhere.

## Publication safeguards

Every pull request and every push to a release branch runs, on Linux, macOS,
and Windows across Node.js 22 and 24:

- dependency installation from lockfiles;
- production dependency vulnerability auditing (`npm run audit:deps`), which
  fails on any unreviewed high or critical advisory and allows an exception
  only when it names the advisory, states a reason a script can re-check, and
  carries an expiry date;
- TypeScript checks and the automated test suite with coverage thresholds;
- a repository scan for credentials, private local paths, unapproved
  presentation/document artifacts, confidential identifiers, and
  source-provenance language;
- version consistency checks across npm, VS Code, Codex plugin, lockfiles, and
  runtime metadata;
- deterministic package, VSIX, plugin archive, and checksum generation;
- a clean-project install proving the published package writes nothing outside
  the consuming project.

Maintainers should also enable GitHub secret scanning, push protection, branch
protection with these checks required, private vulnerability reporting, and
release-environment approval in repository settings.

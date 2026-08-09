# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or private-data leak. Use GitHub's **Security → Report a vulnerability** private reporting flow for `ghassenbrg/slide-agent`. Include the affected version, reproduction steps, impact, and any proposed mitigation.

## Supported releases

Security fixes target the latest published stable version. Older releases may receive a deprecation notice instead of a backport.

## Handling untrusted input

A presentation outline, a freeform canvas, and an NDJSON scene are all
model-authored, and a host model routinely builds them from material Slide
Agent cannot vouch for — a web page, a customer brief, a file in a repository.
Slide Agent therefore treats every path and URL in a request as untrusted:

- **Remote assets are refused by default.** Fetching `http(s)` image URLs
  requires `allowRemoteAssets` on the request or
  `SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1`.
- **Even when enabled, private networks stay unreachable.** Loopback, RFC1918,
  link-local (including cloud metadata endpoints), carrier-grade NAT, and
  IPv4-mapped equivalents are refused before the request is made and re-checked
  after every redirect. `SLIDE_AGENT_ALLOWED_IMAGE_HOSTS` narrows this further
  to an explicit hostname allowlist.
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

Optional preview rendering shells out to LibreOffice and Poppler. Those run
against files you supply; discovery honours `SLIDE_AGENT_SOFFICE` and
`SLIDE_AGENT_PDFTOPPM` if you need to pin the executables.

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

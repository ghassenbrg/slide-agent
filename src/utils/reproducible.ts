/**
 * A single build timestamp for everything a run writes.
 *
 * The same scene used to produce different bytes on every build: the manifest
 * carried `new Date()`, and each zip entry carried whatever second it was
 * compressed in. That makes `packageSha256` weaker than it looks — it proves
 * the file has not been altered since this run, not that the run produced what
 * the scene describes — and it means `diff` and any build cache see churn in
 * decks that are materially identical.
 *
 * `SOURCE_DATE_EPOCH` is the cross-ecosystem convention for pinning it: set it
 * to seconds since the Unix epoch and two builds of the same input produce
 * byte-identical packages. Unset, a build stamps the real time, which is what
 * someone opening the deck's properties expects to see.
 *
 * https://reproducible-builds.org/docs/source-date-epoch/
 */

/** The MS-DOS date format used inside a zip cannot represent anything earlier. */
const DOS_EPOCH_SECONDS = 315_532_800; // 1980-01-01T00:00:00Z

let overridden: Date | undefined;

function fromEnvironment(): Date | undefined {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (!raw) return undefined;
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return new Date(Math.max(seconds, DOS_EPOCH_SECONDS) * 1000);
}

/** The timestamp every artifact in this build should carry. */
export function buildTimestamp(): Date {
  return overridden ?? fromEnvironment() ?? new Date();
}

/** True when the build is pinned, so callers can promise reproducibility. */
export function isReproducibleBuild(): boolean {
  return overridden !== undefined || fromEnvironment() !== undefined;
}

/**
 * Pin the timestamp for the current process. Intended for tests and for
 * embedders that already have a deterministic clock; `SOURCE_DATE_EPOCH` is
 * the supported route for everyone else.
 */
export function setBuildTimestamp(when: Date | undefined): void {
  overridden = when;
}

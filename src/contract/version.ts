/**
 * The authoring contract's own version, deliberately independent of the engine
 * version. A host pins the contract it authors against; the engine underneath
 * can move without forcing every integration to change.
 *
 * Bump the minor for additive fields, the major for anything a conforming host
 * would have to change to keep producing valid output.
 *
 * It is `0.9` rather than `1.0` on purpose: no integration outside this
 * repository has implemented it yet, and claiming stability before that would
 * be a promise made on no evidence.
 */
export const CONTRACT_VERSION = "0.9";

/** The identifier carried by the first record of every NDJSON scene file. */
export const SCENE_SCHEMA_ID = "slide-agent.scene/1";

/**
 * True when `version` is one this engine can accept.
 *
 * While the contract is `0.x`, a minor bump is a breaking change — that is what
 * `0.x` means — so compatibility is major *and* minor. From `1.0` onward, minor
 * bumps are additive and only the major has to match.
 */
export function supportsContractVersion(version: string): boolean {
  const [major, minor] = version.split(".");
  const [ourMajor, ourMinor] = CONTRACT_VERSION.split(".");
  if (major !== ourMajor) return false;
  return ourMajor === "0" ? minor === ourMinor : true;
}

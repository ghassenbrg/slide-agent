/**
 * The authoring contract's own version, deliberately independent of the engine
 * version. A host pins the contract it authors against; the engine underneath
 * can move without forcing every integration to change.
 *
 * Bump the minor for additive fields, the major for anything a conforming host
 * would have to change to keep producing valid output.
 *
 * It is `0.10` rather than `1.0` on purpose: no integration outside this
 * repository has implemented it yet, and claiming stability before that would
 * be a promise made on no evidence.
 *
 * `0.10` is additive over `0.9` — open visual systems, style references, the
 * wider canvas, review packets, and portable packages are all optional — but
 * a `0.x` minor is still a deliberate adoption step, so hosts must opt in.
 * `MIGRATION-0.10.md` says what changed and what a 0.9 host keeps.
 */
export const CONTRACT_VERSION = "0.10";

/** Contract versions this engine still accepts scenes and requests from. */
export const SUPPORTED_CONTRACT_VERSIONS = ["0.9", "0.10"] as const;

/** The identifier carried by the first record of every NDJSON scene file. */
export const SCENE_SCHEMA_ID = "slide-agent.scene/1";

/**
 * True when `version` is one this engine can accept.
 *
 * While the contract is `0.x`, a minor bump is normally a breaking change —
 * that is what `0.x` means. `0.10` is the exception the roadmap asked for: it
 * only adds optional fields, so a 0.9 host keeps working unchanged during the
 * transition, and the accepted set is stated explicitly rather than inferred.
 * From `1.0` onward, minor bumps are additive and only the major has to match.
 */
export function supportsContractVersion(version: string): boolean {
  const [major, minor] = version.split(".");
  const [ourMajor] = CONTRACT_VERSION.split(".");
  if (major !== ourMajor) return false;
  if (ourMajor !== "0") return true;
  return (SUPPORTED_CONTRACT_VERSIONS as readonly string[]).includes(`${major}.${minor}`);
}

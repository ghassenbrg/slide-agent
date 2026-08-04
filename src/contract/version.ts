/**
 * The authoring contract's own version, deliberately independent of the engine
 * version. A host pins the contract it authors against; the engine underneath
 * can move without forcing every integration to change.
 *
 * Bump the minor for additive fields, the major for anything a conforming host
 * would have to change to keep producing valid output.
 */
export const CONTRACT_VERSION = "1.0";

/** The identifier carried by the first record of every NDJSON scene file. */
export const SCENE_SCHEMA_ID = "slide-agent.scene/1";

/** True when `version` is one this engine can accept. */
export function supportsContractVersion(version: string): boolean {
  const [major] = version.split(".");
  return major === CONTRACT_VERSION.split(".")[0];
}

declare module "../../scripts/verify-release.mjs" {
  export function normalizeWorkflowText(text: string): string;
  export function hasWorkflowFragment(content: string, fragment: string): boolean;
  export function verifyRelease(): Promise<number>;
}

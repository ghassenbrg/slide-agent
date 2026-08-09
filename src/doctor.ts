import { access, readFile, readdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { CONTRACT_VERSION } from "./contract/index.js";
import { loadConfig } from "./config/load-config.js";
import { checkFontAvailability } from "./design/font-availability.js";
import { findExecutable } from "./utils/process.js";
import { VERSION } from "./version.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
  /** What to do about a non-ok result. */
  remedy?: string;
}

export interface AgentIntegrationCheck extends DoctorCheck {
  target: string;
  /** Slide Agent wrote its skill where it expects the host to look. */
  registered: boolean;
  /**
   * A host configuration was found that actually references the skill.
   * `registered` without `verified` means we placed a file and are trusting the
   * host to read it — a claim about the host, not a fact about this machine.
   */
  verified: boolean;
  support: "verified" | "best-effort" | "experimental";
  evidence: string[];
}

export interface DoctorReport {
  version: string;
  contractVersion: string;
  checks: DoctorCheck[];
  agents: AgentIntegrationCheck[];
  status: "ok" | "warning" | "error";
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

/** The first file under `directory` whose contents mention `needle`. */
async function configMentions(directory: string, fileNames: string[], needle: string): Promise<string | undefined> {
  for (const fileName of fileNames) {
    const candidate = path.join(directory, fileName);
    const contents = await readFile(candidate, "utf8").catch(() => undefined);
    if (contents?.includes(needle)) return candidate;
  }
  return undefined;
}

interface AgentTarget {
  target: string;
  name: string;
  skillsDir: string;
  configDir: string;
  configFiles: string[];
  support: AgentIntegrationCheck["support"];
  note: string;
}

function agentTargets(home: string): AgentTarget[] {
  return [
    {
      target: "codex",
      name: "Codex / Agent Skills",
      skillsDir: process.env.SLIDE_AGENT_CODEX_SKILLS_DIR ?? path.join(home, ".agents", "skills"),
      configDir: path.join(home, ".codex"),
      configFiles: ["config.toml", "config.json"],
      support: "verified",
      note: "Codex and other hosts implementing the shared Agent Skills layout discover ~/.agents/skills.",
    },
    {
      target: "claude",
      name: "Claude Code",
      skillsDir: process.env.SLIDE_AGENT_CLAUDE_SKILLS_DIR ?? path.join(home, ".claude", "skills"),
      configDir: path.join(home, ".claude"),
      configFiles: ["settings.json", "settings.local.json", ".claude.json"],
      support: "verified",
      note: "Claude Code loads personal skills from ~/.claude/skills.",
    },
    {
      target: "copilot",
      name: "GitHub Copilot CLI",
      skillsDir: process.env.SLIDE_AGENT_COPILOT_SKILLS_DIR ?? path.join(home, ".copilot", "skills"),
      configDir: path.join(home, ".copilot"),
      configFiles: ["config.json"],
      support: "best-effort",
      note: "Registered under ~/.copilot/skills. Confirm your Copilot CLI build reads personal skills from there; otherwise drive the CLI directly.",
    },
    {
      target: "gemini",
      name: "Gemini CLI",
      skillsDir: process.env.SLIDE_AGENT_GEMINI_SKILLS_DIR ?? path.join(home, ".gemini", "skills"),
      configDir: path.join(home, ".gemini"),
      configFiles: ["settings.json"],
      support: "experimental",
      note: "Gemini CLI's documented extension point is ~/.gemini/extensions, not a skills directory. Drive Slide Agent through the CLI or the MCP server instead.",
    },
  ];
}

async function checkAgent(target: AgentTarget): Promise<AgentIntegrationCheck> {
  const skillPath = target.skillsDir.endsWith("slide-agent") ? target.skillsDir : path.join(target.skillsDir, "slide-agent");
  const registered = await exists(path.join(skillPath, "SKILL.md"));
  const evidence: string[] = [];
  if (registered) evidence.push(`skill present at ${skillPath}`);

  const referenced = await configMentions(target.configDir, target.configFiles, "slide-agent");
  if (referenced) evidence.push(`referenced by ${referenced}`);

  const extensionDir = path.join(target.configDir, "extensions", "slide-agent");
  const hasExtension = await exists(extensionDir);
  if (hasExtension) evidence.push(`extension installed at ${extensionDir}`);

  const verified = Boolean(referenced) || hasExtension || (registered && target.support === "verified");
  const status: DoctorCheck["status"] = !registered ? "warning" : target.support === "experimental" ? "warning" : "ok";

  return {
    target: target.target,
    name: target.name,
    status,
    registered,
    verified,
    support: target.support,
    evidence,
    detail: registered
      ? `${skillPath} — registered${verified ? " and referenced by this host" : ", host wiring unconfirmed"}`
      : `not registered; expected ${skillPath}`,
    ...(registered
      ? (target.support === "verified" ? {} : { remedy: target.note })
      : { remedy: `Run \`slide-agent install --target ${target.target}\`.` }),
  };
}

/** Host configurations that would record an MCP server registration. */
async function mcpEvidence(home: string): Promise<string[]> {
  const candidates: Array<[string, string[]]> = [
    [path.join(home, ".codex"), ["config.toml", "config.json"]],
    [path.join(home, ".claude"), [".claude.json", "settings.json"]],
    [path.join(home, ".cursor"), ["mcp.json"]],
    [path.join(home, ".config", "mcp"), ["config.json"]],
    [home, [".mcp.json"]],
  ];
  const found: string[] = [];
  for (const [directory, files] of candidates) {
    const hit = await configMentions(directory, files, "slide-agent-mcp");
    if (hit) found.push(hit);
  }
  return found;
}

export async function runDoctorReport(): Promise<DoctorReport> {
  const home = homedir();
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split(".").map(Number);
  const nodeSupported = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 12);

  const checks: DoctorCheck[] = [{
    name: "Node.js",
    status: nodeSupported ? "ok" : "error",
    detail: `${process.versions.node} (${process.execPath})`,
    ...(nodeSupported ? {} : { remedy: "Slide Agent needs Node.js 22.12 or newer. Install it with nvm, fnm, or volta." }),
  }];

  const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
  const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
  const renderRemedy = "Only needed for PDF/PNG previews. Install with `slide-agent install --with-render-deps`.";
  checks.push({
    name: "LibreOffice (optional)",
    status: soffice ? "ok" : "warning",
    detail: soffice ?? "not found",
    ...(soffice ? {} : { remedy: renderRemedy }),
  });
  checks.push({
    name: "Poppler (optional)",
    status: pdftoppm ? "ok" : "warning",
    detail: pdftoppm ?? "not found",
    ...(pdftoppm ? {} : { remedy: renderRemedy }),
  });

  // Advisory, never an error: the default faces are what a deck falls back to
  // when a model does not choose, and a machine without them still builds a
  // correct deck — it just previews it in something else.
  const defaults = await loadConfig().then(
    (config) => [config.fonts.heading, config.fonts.body, config.fonts.mono],
    () => [],
  );
  if (defaults.length > 0) {
    const availability = await checkFontAvailability(defaults);
    const missing = availability.filter((entry) => !entry.available);
    checks.push({
      name: "Default fonts (optional)",
      status: missing.length === 0 ? "ok" : "warning",
      detail: missing.length === 0
        ? `${availability.map((entry) => entry.family).join(", ")} all resolve on this machine`
        : `${missing.map((entry) => entry.family).join(", ")} not installed here`,
      ...(missing.length === 0 ? {} : {
        remedy: "Previews on this machine substitute another face. The decks you produce are unaffected; install the fonts if you need the previews to be faithful.",
      }),
    });
  }

  const mcpLauncher = await findExecutable(["slide-agent-mcp"]);
  const mcpHosts = await mcpEvidence(home);
  checks.push({
    name: "MCP server",
    status: mcpLauncher && mcpHosts.length > 0 ? "ok" : "warning",
    detail: mcpLauncher
      ? `${mcpLauncher}${mcpHosts.length > 0 ? `; registered by ${mcpHosts.join(", ")}` : "; no host configuration references it"}`
      : "launcher not found on PATH",
    ...(mcpLauncher && mcpHosts.length > 0 ? {} : {
      remedy: mcpLauncher
        ? `The launcher works, but nothing is configured to call it. Add it to your MCP host as {"command":"${mcpLauncher}"}.`
        : "Run `slide-agent install` to create the launcher.",
    }),
  });

  // A registration written by an older version can point inside a project's
  // node_modules, which breaks as soon as that project is removed or upgraded.
  const stale: string[] = [];
  for (const target of agentTargets(home)) {
    const skillPath = path.join(target.skillsDir, "slide-agent");
    const marker = await readFile(path.join(skillPath, ".slide-agent-install.json"), "utf8").catch(() => undefined);
    if (marker?.includes("node_modules") && !marker.includes(".local")) stale.push(skillPath);
  }
  if (stale.length > 0) {
    checks.push({
      name: "Stale registrations",
      status: "warning",
      detail: `${stale.length} skill link(s) point inside a project's node_modules: ${stale.join(", ")}`,
      remedy: "Run `slide-agent install` to re-point them at the managed installation.",
    });
  }

  const agents = await Promise.all(agentTargets(home).map(checkAgent));
  const all: DoctorCheck[] = [...checks, ...agents];
  return {
    version: VERSION,
    contractVersion: CONTRACT_VERSION,
    checks,
    agents,
    status: all.some((check) => check.status === "error")
      ? "error"
      : all.some((check) => check.status === "warning") ? "warning" : "ok",
  };
}

/** Builds a deck end to end and reports whether generation actually works. */
export async function runDeepCheck(): Promise<DoctorCheck> {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { SlideAgent } = await import("./pipeline.js");
  const { silentLogger } = await import("./logging/logger.js");
  const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-doctor-"));
  try {
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      prompt: "A short check that Slide Agent can build a deck end to end.",
      output: path.join(workspace, "check.pptx"),
      validate: true,
    });
    if (result.status === "error") {
      return {
        name: "End-to-end generation",
        status: "error",
        detail: result.errors.map((error) => `${error.code}: ${error.message}`).join("; "),
        remedy: "Generation is broken in this installation. Please file an issue with this output attached.",
      };
    }
    const files = await readdir(workspace);
    return {
      name: "End-to-end generation",
      status: "ok",
      detail: `built a ${result.slideCount}-slide deck (${files.length} output entries), validation ${result.validation?.status ?? "skipped"}`,
    };
  } catch (error) {
    return {
      name: "End-to-end generation",
      status: "error",
      detail: error instanceof Error ? error.message : String(error),
      remedy: "Generation threw before producing a deck. Please file an issue with this output attached.",
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** Flat check list, kept for callers that only need pass/fail lines. */
export async function runDoctor(): Promise<DoctorCheck[]> {
  const report = await runDoctorReport();
  return [...report.checks, ...report.agents];
}

function symbol(status: DoctorCheck["status"]): string {
  return status === "ok" ? "✓" : status === "warning" ? "!" : "✗";
}

export function formatDoctor(checks: DoctorCheck[]): string {
  return [
    "Slide Agent doctor",
    ...checks.flatMap((check) => [
      `${symbol(check.status)} ${check.name}: ${check.detail}`,
      ...(check.remedy ? [`    → ${check.remedy}`] : []),
    ]),
  ].join("\n");
}

export function formatDoctorReport(report: DoctorReport): string {
  return [
    `Slide Agent ${report.version} · authoring contract ${report.contractVersion}`,
    "",
    ...report.checks.flatMap((check) => [
      `${symbol(check.status)} ${check.name}: ${check.detail}`,
      ...(check.remedy ? [`    → ${check.remedy}`] : []),
    ]),
    "",
    "Agent integrations",
    ...report.agents.flatMap((agent) => [
      `${symbol(agent.status)} ${agent.name} [${agent.support}]: ${agent.detail}`,
      ...(agent.remedy ? [`    → ${agent.remedy}`] : []),
    ]),
  ].join("\n");
}

/**
 * Hyperlink safety.
 *
 * A canvas is model-authored and routinely derived from material the project
 * cannot vouch for, so SECURITY.md promises that every URL in a request is
 * treated as untrusted and that only local paths and `http(s)` URLs are
 * accepted. Images honoured that; links did not. `style.options` is spread
 * straight into PptxGenJS, so `{hyperlink: {url: "file:///Users/..."}}` reached
 * the package untouched — a deck built from a scraped page could ship a link
 * to a local path, an SMB share, or a scheme registered to some other
 * application on the reader's machine.
 *
 * PowerPoint prompts before following a link, so this is a hardening measure
 * rather than a silent execution path. Links are still allowed; they are
 * checked, and a rejected one is reported rather than quietly dropped.
 */

/**
 * Schemes a deck may link to. `http`/`https` are the web; `mailto` is the one
 * non-web scheme a real presentation routinely needs. Anything else — `file`,
 * `smb`, `javascript`, `data`, `vbscript`, an application's own scheme — is
 * refused.
 */
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"] as const;

export interface DeckLink {
  /** An external URL, already checked against the scheme allowlist. */
  url?: string;
  /** A 1-based slide number for a link inside the same deck. */
  slide?: number;
  tooltip?: string;
}

export interface LinkCheck {
  link?: DeckLink;
  /** Why the link was refused, phrased for a model to act on. */
  rejected?: string;
}

function schemeOf(value: string): string | undefined {
  // A bare `example.com/path` has no scheme; treat it as https rather than
  // rejecting it, which is what every authoring tool does and what a model
  // writing `slide-agent.dev` means.
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim());
  return match ? `${match[1]!.toLowerCase()}:` : undefined;
}

/** Validate one link value from a model-authored scene. */
export function checkLink(value: unknown): LinkCheck {
  if (value === undefined || value === null) return {};

  if (typeof value === "object" && "slide" in (value as Record<string, unknown>)) {
    const slide = Number((value as { slide: unknown }).slide);
    if (!Number.isInteger(slide) || slide < 1) {
      return { rejected: `A slide link needs a 1-based slide number, not ${JSON.stringify((value as { slide: unknown }).slide)}.` };
    }
    const tooltip = (value as { tooltip?: unknown }).tooltip;
    return { link: { slide, ...(typeof tooltip === "string" ? { tooltip } : {}) } };
  }

  const raw = typeof value === "string"
    ? value
    : typeof value === "object" && typeof (value as { url?: unknown }).url === "string"
      ? (value as { url: string }).url
      : undefined;
  if (raw === undefined) return { rejected: `A link must be a URL string, {url}, or {slide}; got ${JSON.stringify(value)}.` };

  const trimmed = raw.trim();
  if (!trimmed) return { rejected: "A link cannot be empty." };

  const scheme = schemeOf(trimmed);
  const normalized = scheme ? trimmed : `https://${trimmed}`;
  if (scheme && !(ALLOWED_LINK_SCHEMES as readonly string[]).includes(scheme)) {
    return { rejected: `Refused a ${scheme} link. Decks may link to ${ALLOWED_LINK_SCHEMES.join(", ")} only.` };
  }

  try {
    // Rejects control characters and malformed authorities that would
    // otherwise be written verbatim into the relationship part.
    const parsed = new URL(normalized);
    const tooltip = typeof value === "object" ? (value as { tooltip?: unknown }).tooltip : undefined;
    return { link: { url: parsed.href, ...(typeof tooltip === "string" ? { tooltip } : {}) } };
  } catch {
    return { rejected: `Refused an unparseable link: ${JSON.stringify(raw)}.` };
  }
}

/** The PptxGenJS shape of a checked link. */
export function toNativeHyperlink(link: DeckLink): Record<string, unknown> {
  return {
    ...(link.url ? { url: link.url } : {}),
    ...(link.slide ? { slide: link.slide } : {}),
    ...(link.tooltip ? { tooltip: link.tooltip } : {}),
  };
}

/**
 * Strip any hyperlink smuggled through the `options` passthrough that would
 * not survive `checkLink`, and report what was removed. The passthrough exists
 * so a model can reach PptxGenJS options the contract does not model; it is
 * not a way around the contract's own checks.
 */
export function sanitizeNativeOptions(
  options: Record<string, unknown> | undefined,
  onRejected?: (reason: string) => void,
): Record<string, unknown> | undefined {
  if (!options || !("hyperlink" in options)) return options;

  const { link, rejected } = checkLink(options.hyperlink);
  const rest = { ...options };
  delete rest.hyperlink;
  if (link) return { ...rest, hyperlink: toNativeHyperlink(link) };
  if (rejected) onRejected?.(rejected);
  return rest;
}

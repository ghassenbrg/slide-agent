// Copies the repository's own documentation into the site at build time, so
// docs/ and references/ stay the single source of truth.
//
//   node scripts/sync-docs.mjs
//
// Links between pages the site includes become site links; every other
// repository link (examples, source files, migration notes) becomes a GitHub
// link, so nothing on the site points at a file that is not there.

import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, posix, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SITE, '..');
const OUT = join(SITE, 'reference');
const BLOB = 'https://github.com/ghassenbrg/slide-agent/blob/main/';

// Repository file → page on the site.
const PAGES = {
	'docs/quickstart.md': 'quickstart.md',
	'docs/agents.md': 'agents.md',
	'docs/mcp.md': 'mcp.md',
	'docs/cli.md': 'cli.md',
	'docs/editing.md': 'editing.md',
	'docs/validation.md': 'validation.md',
	'docs/troubleshooting.md': 'troubleshooting.md',
	'docs/api.md': 'api.md',
	'docs/architecture.md': 'architecture.md',
	'references/v2/grammar.md': 'grammar.md',
	'references/v2/recipes.md': 'recipes.md',
};

const rewrite = (markdown, source) => {
	const from = posix.dirname(source);
	return markdown.replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (whole, open, target, close) => {
		if (/^(https?:|mailto:|#)/.test(target)) return whole;
		const [path, hash = ''] = target.split('#');
		const repoPath = posix.normalize(posix.join(from, path));
		const anchor = hash ? `#${hash}` : '';
		if (PAGES[repoPath]) return `${open}./${PAGES[repoPath]}${anchor}${close}`;
		return `${open}${BLOB}${repoPath}${anchor}${close}`;
	});
};

rmSync(OUT, {recursive: true, force: true});
mkdirSync(OUT, {recursive: true});
for (const [source, page] of Object.entries(PAGES)) {
	const markdown = readFileSync(join(REPO, source), 'utf8');
	const banner = `<!-- Generated from ${source} by site/scripts/sync-docs.mjs. Edit the source, not this copy. -->\n\n`;
	writeFileSync(join(OUT, page), banner + rewrite(markdown, source));
	console.log(`${source} → ${relative(SITE, join(OUT, page))}`);
}

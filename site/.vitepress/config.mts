import {defineConfig} from 'vitepress';

// SITE_BASE comes from the Pages workflow (actions/configure-pages): "/" once a
// custom domain such as slide-agent.ghassen.io is set, "/slide-agent/" on the
// default github.io address. Locally it defaults to "/".
const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
	base,
	lang: 'en-US',
	title: 'Slide Agent',
	description: 'An open-source AI agent that designs native, editable PowerPoint decks. Describe it. Get the deck.',
	cleanUrls: true,
	lastUpdated: true,
	head: [
		['link', {rel: 'icon', type: 'image/png', href: `${base}icon.png`}],
		['meta', {property: 'og:title', content: 'Slide Agent — describe a deck, get real PowerPoint'}],
		['meta', {property: 'og:description', content: 'An open-source AI agent that designs native, editable PowerPoint decks.'}],
		['meta', {property: 'og:image', content: `${base}showcase/announcement.png`}],
	],
	themeConfig: {
		logo: '/icon.png',
		nav: [
			{text: 'Install', link: '/guide/install'},
			{text: 'Guide', link: '/guide/'},
			{text: 'Reference', link: '/reference/cli'},
			{text: 'Showcase', link: '/showcase'},
		],
		sidebar: [
			{
				text: 'Get started',
				items: [
					{text: 'What is Slide Agent?', link: '/guide/'},
					{text: 'Install', link: '/guide/install'},
					{text: 'Quickstart', link: '/reference/quickstart'},
				],
			},
			{
				text: 'Use it',
				items: [
					{text: 'With your AI assistant', link: '/reference/agents'},
					{text: 'Over MCP', link: '/reference/mcp'},
					{text: 'Editing decks', link: '/reference/editing'},
					{text: 'Validation and quality', link: '/reference/validation'},
					{text: 'Troubleshooting', link: '/reference/troubleshooting'},
				],
			},
			{
				text: 'Reference',
				items: [
					{text: 'CLI', link: '/reference/cli'},
					{text: 'Composition grammar', link: '/reference/grammar'},
					{text: 'Recipes', link: '/reference/recipes'},
					{text: 'Library API', link: '/reference/api'},
					{text: 'Architecture', link: '/reference/architecture'},
				],
			},
			{text: 'Showcase', link: '/showcase'},
		],
		socialLinks: [{icon: 'github', link: 'https://github.com/ghassenbrg/slide-agent'}],
		search: {provider: 'local'},
		editLink: {pattern: 'https://github.com/ghassenbrg/slide-agent/edit/main/site/:path', text: 'Edit this page on GitHub'},
		footer: {message: 'Released under the MIT License.', copyright: 'Slide Agent'},
	},
});

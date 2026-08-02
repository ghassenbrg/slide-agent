# Slide Agent release and publishing runbook

This is the maintainer procedure for every Slide Agent version. It covers the npm package, `npx` installer, VS Code extension, Codex plugin archive, and GitHub release. Run commands from the repository root unless a step says otherwise.

## 1. Understand the release surfaces

One version number is shared by all public surfaces:

| Surface | Artifact or publication |
| --- | --- |
| npm library and CLI | `@slide-agent/core` |
| npx installer | Executes the npm package; there is no separate npx publication |
| VS Code | `ghassenbrg.slide-agent-vscode` and a `.vsix` file |
| Codex | `slide-agent-codex-plugin-<version>.zip` plus the repo marketplace definition |
| GitHub | Tagged release containing the npm tarball, VSIX, plugin ZIP, and `SHA256SUMS` |

Never reuse or overwrite a published version. If a release is wrong, publish a new patch version.

## 2. One-time publisher setup

### npm

1. Sign in to npm and confirm that the publishing account or organization owns the `@slide-agent` scope and may publish `@slide-agent/core`.
2. For the first publication, use an npm account with two-factor authentication and publish manually, or temporarily configure the `NPM_TOKEN` GitHub Environment secret:

   ```bash
   npm login
   npm publish --access public --provenance
   ```

3. After the package exists on npm, configure npm **Trusted publishing** for:

   - provider: GitHub Actions;
   - organization/user: `ghassenbrg`;
   - repository: `slide-agent`;
   - workflow filename: `release.yml`;
   - environment: `release`;
   - allowed action: publish.

4. Remove the long-lived `NPM_TOKEN` after trusted publishing succeeds. The release workflow uses a GitHub-hosted runner, Node 24, a current npm CLI, and `id-token: write`, so npm can use short-lived OIDC credentials and generate provenance automatically. See the official [npm trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and [npm provenance guide](https://docs.npmjs.com/generating-provenance-statements/).

### VS Code Marketplace

1. Create or confirm the Visual Studio Marketplace publisher ID `ghassenbrg` and ensure the publishing identity is a Contributor.
2. Confirm the extension identifier `ghassenbrg.slide-agent-vscode` is available or already owned by that publisher.
3. Preferred long-term path: use Microsoft Entra identity-based publishing from the publisher's managed release pipeline.
4. GitHub Actions fallback: add an appropriately scoped Marketplace token as the `VSCE_PAT` secret in the protected `release` GitHub Environment. The release workflow publishes automatically only when this secret exists.
5. No-token fallback: download the `.vsix` produced by GitHub Actions and upload it through the Marketplace publisher management page.

Microsoft's current guidance is in [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension). Recheck it before changing authentication because Marketplace identity and token policies evolve.

### GitHub repository

1. Create a protected GitHub Environment named `release` and require maintainer approval.
2. Protect `main`; require the `Slide Agent CI` checks before merge.
3. Protect tags matching `v*` or restrict who can create them.
4. Enable secret scanning, push protection, Dependabot, private vulnerability reporting, and branch protection.
5. Keep `contents: write` and `id-token: write` limited to `.github/workflows/release.yml`.

## 3. Choose the next version

Use semantic versioning:

- patch (`1.1.0` → `1.1.1`) for compatible fixes;
- minor (`1.1.0` → `1.2.0`) for compatible features;
- major (`1.x` → `2.0.0`) for breaking CLI, API, scene-schema, installer, or extension changes.

Start from an up-to-date clean `main` branch:

```bash
git switch main
git pull --ff-only origin main
git status --short
```

Set the version everywhere with one command:

```bash
npm run version:set -- 1.2.0
```

This synchronizes `package.json`, both lockfiles, the VS Code manifest, the Codex plugin manifest, and `src/version.ts`.

Move the completed entries in `CHANGELOG.md` from **Unreleased** into a new dated section for that exact version. Leave a fresh empty **Unreleased** section at the top.

## 4. Run the local release gates

Install exactly from lockfiles and run all checks:

```bash
npm run lockfile:verify
npm ci
npm --prefix extensions/vscode ci
npm audit --omit=dev --audit-level=high
npm run plugin:build
npm run plugin:validate
npm run release:verify
npm run verify
npm run verify:install
npm run release:artifacts
```

Run `lockfile:verify` before `npm ci`. It validates dependencies from every locked package, including optional cross-platform branches that the current operating system may ignore. This catches a Linux-incomplete lockfile even when `npm install` on macOS reports that everything is already up to date.

`release:verify` fails on version drift, confidential identifiers, source-provenance language, credentials, local developer paths, unapproved presentation/document files, missing legal/security files, or icon drift.

The last command creates:

```text
release/
├── slide-agent-core-<version>.tgz
├── slide-agent-vscode-<version>.vsix
├── slide-agent-codex-plugin-<version>.zip
└── SHA256SUMS
```

Verify the checksums:

```bash
cd release
shasum -a 256 -c SHA256SUMS
cd ..
```

Inspect what npm will publish:

```bash
npm publish --dry-run --access public
```

Inspect the VSIX manifest without installing it:

```bash
cd extensions/vscode
npx vsce ls
cd ../..
```

Do not continue if a gate fails. Fix the source, rebuild the plugin and artifacts, and run the complete gate again.

## 5. Commit and tag

Commit the version and changelog together:

```bash
git add package.json package-lock.json src/version.ts \
  extensions/vscode/package.json extensions/vscode/package-lock.json \
  distribution/codex/plugins/slide-agent/.codex-plugin/plugin.json \
  CHANGELOG.md
git commit -m "release: v1.2.0"
git tag -s v1.2.0 -m "Slide Agent v1.2.0"
git push origin main
git push origin v1.2.0
```

Use an annotated unsigned tag (`git tag -a`) only when signed tags are not configured. The tag must be exactly `v<package version>`; the release gate rejects any mismatch.

Pushing the tag starts `.github/workflows/release.yml`. A manual `workflow_dispatch` run builds and audits artifacts but deliberately does not publish npm, Marketplace, or a GitHub release because it has no version tag.

## 6. What the release workflow does

For a version tag, GitHub Actions:

1. checks out the complete tag;
2. installs Node 24 and a current npm CLI;
3. installs both lockfiles;
4. runs production dependency, privacy, copyright, version, build, test, plugin, VSIX, and managed-install gates;
5. builds the npm tarball, VSIX, Codex plugin ZIP, and SHA-256 checksums;
6. uploads the artifacts to the workflow run;
7. publishes `@slide-agent/core` through npm trusted publishing or the temporary `NPM_TOKEN` fallback;
8. publishes the VS Code extension only when `VSCE_PAT` is configured;
9. creates the GitHub release from the verified tag and attaches every artifact.

If npm publishing fails, the job stops before creating the GitHub release. A published npm version is immutable; diagnose the credential, scope, or version problem and use a new version when package contents must change.

## 7. Verify the public release

Replace `1.2.0` with the actual version:

```bash
npm view @slide-agent/core@1.2.0 version dist.integrity repository.url
npm pack @slide-agent/core@1.2.0 --dry-run
npx --yes --package @slide-agent/core@1.2.0 -- slide-agent --version
```

Verify the end-user installer in a test account or disposable environment:

```bash
npx --yes --package @slide-agent/core@1.2.0 -- slide-agent install
slide-agent doctor
slide-agent uninstall
```

Confirm that:

- the npm package shows the expected version and provenance badge;
- the npx command prints the same version;
- the GitHub release contains all four files and matching checksums;
- the VS Code Marketplace shows the new version, icon, README, commands, and publisher;
- installing the released VSIX succeeds when Marketplace publishing was skipped;
- the Codex plugin ZIP contains only the plugin manifest, MCP definition, original skill documentation, and official icon.

## 8. Manual publishing fallbacks

Only use these after all local gates pass.

Publish npm manually:

```bash
npm login
npm publish --access public --provenance
```

Publish a previously built VSIX with a permitted Marketplace credential:

```bash
cd extensions/vscode
npx vsce publish --packagePath slide-agent-vscode-1.2.0.vsix
cd ../..
```

Or upload the same VSIX through the Marketplace publisher management page. Never rebuild between verification and manual upload; publish the checked artifact.

## 9. Recovery and deprecation

- npm packages cannot be overwritten. Prefer `npm deprecate @slide-agent/core@<bad-version> "reason; upgrade to <fixed-version>"` and publish a patch.
- Unpublish or remove an npm version only when npm policy and incident severity justify it.
- Use Marketplace **Unpublish** to hide a VS Code version or extension while preserving statistics; removal is irreversible and reserves the identifier.
- Mark a GitHub release as a draft or delete the release entry if necessary, but do not move an existing version tag to different code.
- Rotate any credential immediately if the public-content gate or GitHub secret scanning reports exposure.

## 10. Final maintainer checklist

- [ ] Version is synchronized everywhere.
- [ ] Changelog describes only public, original project work.
- [ ] No customer, employer, partner, private deck, or external reference material is present.
- [ ] Project-owned icon is byte-identical across distributions.
- [ ] Third-party dependency licenses are documented.
- [ ] `npm audit`, `audit:public`, tests, build, plugin validation, VSIX packaging, and managed install/uninstall pass.
- [ ] Tag is signed/annotated and exactly matches the version.
- [ ] npm, npx, GitHub, VS Code, and Codex artifacts are verified after publication.

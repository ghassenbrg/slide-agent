# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or private-data leak. Use GitHub's **Security → Report a vulnerability** private reporting flow for `ghassenbrg/slide-agent`. Include the affected version, reproduction steps, impact, and any proposed mitigation.

## Supported releases

Security fixes target the latest published stable version. Older releases may receive a deprecation notice instead of a backport.

## Publication safeguards

Every pull request and release runs:

- dependency installation from lockfiles;
- production dependency vulnerability auditing;
- TypeScript checks and automated tests;
- a repository scan for credentials, private local paths, unapproved presentation/document artifacts, confidential identifiers, and source-provenance language;
- version consistency checks across npm, VS Code, Codex plugin, lockfiles, and runtime metadata;
- deterministic package, VSIX, plugin archive, and checksum generation.

Maintainers should also enable GitHub secret scanning, push protection, branch protection, required Actions checks, private vulnerability reporting, and release-environment approval in repository settings.

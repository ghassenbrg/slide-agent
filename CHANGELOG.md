# Changelog

All notable public changes are recorded here. Versions follow semantic versioning.

## Unreleased

- Add upcoming changes here before selecting the next version.

## 0.0.1 - 2026-08-02

- Initial release.

## 0.0.2 - 2026-08-02

- Register bundled skills automatically for local and global npm installs, with an explicit CI opt-out.
- Automatically install the matching core engine when the VS Code extension first activates.
- Make executable discovery and its tests portable across Windows, macOS, and Linux.
- Limit CI to pushes and merged pull requests entering `main`.
- Rename and split the release workflow into professional verification and publication jobs.
- Upgrade artifact upload and download actions to Node.js 24-compatible releases.

# Changelog

All notable changes to Terminal Blueprint are documented here. This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Metadata-backed scanning for Node.js, Python, PHP, Java/Kotlin, Go, and Rust projects.
- Deterministic suggestions for verified package scripts and supported standard ecosystem commands.
- Explicit preview, approval, Workspace Trust, and working-directory checks before terminal execution.
- Local blueprint creation, management, import, export, compatibility inspection, and restricted approved execution.
- Native Activity Bar sidebar for detected projects, command suggestions, and saved blueprints.
- Native scan and notification settings, including optional trusted-workspace automatic scanning.
- MIT licensing, Marketplace sponsor metadata, an optional Support Development command, and a native sidebar support action.

### Security

- Bounded scanner depth and directory traversal, protected exclusions, and metadata validation.
- Rejection of reported symlinked metadata files during project scanning.
- Allowlisted execution templates and immutable approved execution plans.

No public release version has been published yet.

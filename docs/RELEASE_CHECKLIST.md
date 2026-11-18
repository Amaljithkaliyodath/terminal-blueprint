# Release Checklist

Use this checklist before creating the first public Terminal Blueprint release. Do not place credentials, tokens, or publisher secrets in this repository.

## Owner decisions still required

- [ ] Register a VS Code Marketplace publisher account.
- [ ] Provide and confirm the exact Marketplace publisher ID for `package.json`.
- [x] Select the MIT License and approve its text.
- [x] Add the MIT `LICENSE` file and matching package metadata.
- [x] Configure the Buy Me a Coffee support URL.

## Metadata and public material

- [ ] Verify extension name, display name, description, categories, keywords, repository, homepage, and issue URL.
- [ ] Review the README and changelog for accuracy.
- [ ] Confirm the support URL opens correctly from the Command Palette and sidebar action.
- [ ] Confirm Marketplace icon and visual assets meet current Marketplace requirements.
- [ ] Remove placeholder, internal, or machine-specific material from the release tree.

## Security and dependencies

- [ ] Review dependency advisories and licenses using current trusted advisory data.
- [ ] Confirm no runtime dependencies, paid APIs, cloud services, credentials, or telemetry were introduced.
- [ ] Review scanner bounds, Workspace Trust enforcement, terminal approval, and metadata-symlink protections.

## Packaging and compatibility

- [ ] Review `.vscodeignore` and add a carefully verified package allowlist or exclusions without removing `out/`, `resources/`, or other runtime assets.
- [ ] Create a VSIX only after packaging configuration is approved.
- [ ] Inspect the VSIX file list for source, tests, local storage, credentials, and unexpected artifacts.
- [ ] Confirm `LICENSE` is included in the release package.
- [ ] Perform a clean VSIX installation test in a separate VS Code profile.
- [ ] Test the declared minimum supported VS Code version, currently `^1.85.0`.

## Release process

- [ ] Run compile, lint, automated tests, and final manual Extension Development Host checks.
- [ ] Prepare GitHub release notes and release assets.
- [ ] Obtain owner approval for Marketplace publication.
- [ ] Publish only after all required checks and owner approvals are complete.

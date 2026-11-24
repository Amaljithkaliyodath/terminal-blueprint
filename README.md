# Terminal Blueprint

Terminal Blueprint is a local-first VS Code extension for understanding a workspace, reviewing metadata-backed terminal command suggestions, and saving repeatable terminal setups as blueprints. It works offline and does not use accounts, API keys, cloud services, or AI services.

## Features

- Scans workspace folders for independently detected root and nested projects.
- Detects supported ecosystems from project metadata rather than source-code guesses.
- Shows verified command suggestions in the Output Channel and native Activity Bar sidebar.
- Requires selection, preview, Workspace Trust, and explicit approval before creating a terminal or sending a command.
- Creates, edits, duplicates, deletes, imports, and exports local terminal blueprints.
- Checks blueprint compatibility with a selected detected project before blueprint execution.
- Supports multi-root workspaces and keeps project working directories isolated.
- Provides bounded scanning, protected directory exclusions, and optional trusted-workspace automatic scanning.

## Supported ecosystems

Project detection supports:

- Node.js projects with Next.js, React, TypeScript, npm, pnpm, Yarn, and Bun metadata.
- Python projects with Django, Flask, FastAPI, pip requirements, Pipenv, Poetry, and uv metadata.
- PHP, Composer, and Laravel metadata.
- Java, Kotlin, Maven, Gradle, and supported Spring Boot metadata.
- Go modules and Rust Cargo package/workspace manifests.

Executable suggestions are intentionally narrower than detection:

- Actual safe package.json and Composer script names.
- Standard Maven lifecycle commands, Gradle task listing, Go module build/test commands, Cargo build/test commands, and Django `manage.py runserver` when verified.

Terminal Blueprint does not infer arbitrary framework entry points, script bodies, command arguments, or deployment commands.

## Installation

Terminal Blueprint is not yet published to the VS Code Marketplace. Once a release VSIX is available, install it in VS Code with **Extensions: Install from VSIX...** and select the release file.

## Getting started

1. Open a workspace folder or multi-root workspace in VS Code.
2. Run **Terminal Blueprint: Scan Project** from the Command Palette.
3. Review detected projects, technologies, package-manager information, and suggestions in the Terminal Blueprint Output Channel.
4. Open the Terminal Blueprint Activity Bar view to inspect projects, suggestions, and saved blueprints.
5. Run **Terminal Blueprint: Run Suggested Command**, select a suggestion, inspect its preview, and explicitly approve it to create a visible integrated terminal.
6. Use **Terminal Blueprint: Create Blueprint** or **Terminal Blueprint: Manage Blueprints** to store reusable command entries locally.
7. Use **Terminal Blueprint: Check Blueprint Compatibility** before running saved blueprint commands with **Terminal Blueprint: Run Blueprint**.

## Settings

All settings are native VS Code settings under `terminalBlueprint`.

| Setting | Default | Behavior |
| --- | --- | --- |
| `terminalBlueprint.autoScan` | `false` | Performs a read-only scan when a trusted workspace opens. It never creates terminals or executes commands. |
| `terminalBlueprint.showNotifications` | `true` | Shows optional informational notifications. Warnings, errors, and approval decisions remain visible. |
| `terminalBlueprint.scanMaxDepth` | `4` | Limits nested scanning depth. Valid values are `0` through `4`; the hard maximum remains `4`. |
| `terminalBlueprint.excludedDirectories` | Protected default list | Adds safe directory names to scanning exclusions. Built-in exclusions cannot be removed. |

## Security model

- Project scanning is read-only and does not run discovered scripts.
- Automatic scanning is disabled by default and requires Workspace Trust when enabled.
- Suggested commands are display-only until the user selects, previews, and explicitly approves one.
- Terminal execution requires Workspace Trust, allowlisted command templates, a verified working directory, and a final state recheck immediately before terminal creation.
- Imported and edited blueprint commands are stored as untrusted text. They can run only when they independently match a currently verified, allowlisted suggestion and pass the normal compatibility and approval workflow.
- Metadata scanner reads reject reported symbolic links, directories, missing files, and unsafe metadata paths. A filesystem can still change between the safety check and read, so this does not eliminate all filesystem TOCTOU risk.

## Known limitations

- Blueprint execution currently supports only saved command text that exactly matches an eligible, verified suggestion for the selected project.
- Blueprint commands with a non-root relative working directory are checked for compatibility but are not executable through the current blueprint launcher.
- Compatibility is advisory; it does not authorize execution or prove a command will succeed.
- Filesystem providers that do not report symbolic-link status cannot be distinguished portably from regular files by the VS Code filesystem API.

## Development

For local development, install dependencies with `npm ci` (or `npm install`), then run:

```text
npm run compile
npm run lint
npm test
```

Press `F5` in VS Code to launch an Extension Development Host for manual testing. Development and normal extension use require no paid external service.

## Contributing

Please use the [issue tracker](https://github.com/Amaljithkaliyodath/terminal-blueprint/issues) for reproducible bugs and focused feature proposals. For code changes, keep the extension local-first, dependency-free at runtime, and covered by relevant tests.

## Support development

Terminal Blueprint is free to use. If you find it useful and want to support ongoing development, you can optionally [support the developer through Buy Me a Coffee](https://buymeacoffee.com/amaljithkab). Donations do not unlock or change any functionality.

## License

Terminal Blueprint is licensed under the MIT License. See [LICENSE](LICENSE) for details.

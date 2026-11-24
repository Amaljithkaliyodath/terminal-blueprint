# Release Readiness Report

**Prepared:** 2026-11-24
**Candidate:** `amalkali.terminal-blueprint` 0.0.1  
**Recommendation:** **GO** for Marketplace publication. Mandatory manual acceptance and package verification are complete; optional polish checks remain separately identified. The final PNG-icon VSIX has been rebuilt, inspected, and installed in an isolated VS Code 1.85 profile.

## Changes in this release-preparation work

- Hardened Gradle detection so a `build.gradle`/`build.gradle.kts` file is not trusted merely because it exists.
- Added conservative, static recognition of supported Groovy/Kotlin Gradle build constructs. Blank, whitespace-only, comments-only, unrelated, and unbalanced build metadata is rejected without evaluating Gradle.
- Removed the resulting `gradle tasks` suggestion for rejected metadata.
- Added Java scanner and scanner-to-suggestion regression coverage.
- Clarified Blueprint command-entry prompts after diagnosing a release-smoke data-entry reversal: the active profile stored the fixture directory as the command while `npm run marker` was only the label. That entry is correctly blocked before approval; a regression test preserves this behavior.
- Removed the redundant explicit `Cancel` button from terminal and Blueprint approval dialogs. Native VS Code modal dismissal remains a safe cancellation; `Approve` is now the sole affirmative action, which avoids duplicate Cancel controls in VS Code 1.85.
- Hardened recursive scanning of drive roots: `$RECYCLE.BIN` and `System Volume Information` are now mandatory exclusions, including Windows case variants. Temporary-fixture coverage confirms neither can contribute project detections or suggestions.

Pre-existing uncommitted work was preserved: the manual checklist updates, Blueprint mixed-command whitespace handling, and Output-channel focus preservation.

## Automated validation

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript compile | PASS | `npm run compile` |
| ESLint | PASS | `npm run lint` |
| Extension-host regression suite | PASS | Final `npm test -- --code-version 1.146.0`: **147 passing, 0 failing** |
| VS Code 1.85 extension-host suite | NOT VERIFIED | Local `D:\VSCode-win32-x64-1.85.0\Code.exe` reports `1.85.0`, commit `af28b32d7e553898b2a91af498b1fb666fdebe0c`, x64. The supported `@vscode/test-electron` API was invoked with that exact executable and fresh isolated profiles. The original D: profiles reported `EPERM` creating log directories. A final fresh `%TEMP%` profile also exited code 1 before the test runner loaded and before VS Code wrote logs. This is an automated-host startup limitation, not a product test result. No newer-version result was substituted. |

The 1.146 test-host logs included unrelated VS Code cache, bundled-extension API-proposal, account, and deprecation warnings. They did not produce extension test failures.

## MT-01 through MT-25 evidence

`PASS` is reserved for observed manual evidence already recorded in `MANUAL_TEST_CHECKLIST.md`. Automated tests strengthen evidence but do not replace manual UI checks.

| ID | Status | Evidence |
| --- | --- | --- |
| MT-01 | PASS | Actual VS Code 1.85 evidence confirms all ten commands appear exactly once, `Hello World` is absent, and the native Focus command is additional VS Code UI. |
| MT-02 | PASS | Actual VS Code 1.85 scan detected the Node/npm marker fixture, suggested `npm run marker`, reported no commands executed, and opened no terminal. |
| MT-03 | PASS | Recorded manual cancel/approve test: one command, one terminal, correct directory. |
| MT-04 | PASS | Actual VS Code 1.85 Restricted Mode disables the undeclared extension entirely; commands and Activity Bar disappear until trust is restored. |
| MT-05 | PASS | Recorded nested/multi-root execution evidence with isolated directories. |
| MT-06 | PASS | Actual VS Code 1.85 verified the authorized picker, correct preview/project/directory, exactly one Approve and one native Cancel button, safe cancellation, and approved marker execution. The earlier rejection was stored-data reversal and was correctly blocked. |
| MT-07 | PASS | Actual 1.85 malformed Go/Node/Rust/Gradle/unsafe-script cases created no executable suggestions or terminals; Output reported no commands executed. Automated symlink coverage passes. |
| MT-08 | PASS | Actual 1.85 verified trusted silent read-only auto-scan, disabled-auto-scan reload behavior, notification suppression without hiding Blueprint approval, and Restricted Mode disable/restore. |
| MT-09 | PARTIAL | Actual 1.85 Refresh Sidebar displayed the detected projects, suggestions, saved Blueprints/compatibility, and Support & About without a terminal or command. Detailed icon, tooltip, and empty-state review remains optional. |
| MT-10 | PARTIAL | npm/pnpm/Yarn/Bun/conflict behavior is automated; existing manual evidence covers only npm/Next.js. |
| MT-11 | PARTIAL | Python, Poetry, Pipenv, uv, Django, Flask, and FastAPI unit coverage passes; batch fixture UI observation remains pending. |
| MT-12 | PARTIAL | Composer/Laravel detection and safe Composer scripts are automated; batch fixture UI observation remains pending. |
| MT-13 | PARTIAL | Maven/Gradle/Kotlin/Spring detection and malformed Gradle/POM rejection are automated; batch fixture UI observation remains pending. |
| MT-14 | PARTIAL | Go/Cargo package/workspace and invalid manifest rejection are automated; batch fixture UI observation remains pending. |
| MT-15 | PARTIAL | CRUD/persistence/concurrency/no-terminal behavior is automated. Actual 1.85 management showed all nine options; cancelled Rename preserved the Blueprint and created no duplicate or terminal. Full edit/reorder/duplicate/delete UI coverage remains optional. |
| MT-16 | PARTIAL | Import/export, validation, duplicate policy, concurrency and I/O failures are automated; native dialog workflow remains pending. |
| MT-17 | PASS | Actual VS Code 1.85 Output showed Blueprint/ID, project, URI working directory, COMPATIBLE status, requirements, warnings/mismatches, reasons, command directory result, and informational safety message; no terminal or command occurred. |
| MT-18 | PARTIAL | Depth, exclusions, nested roots, invalidation, and hard-bound tests pass; Settings UI observation remains pending. |
| MT-19 | PASS | Actual VS Code 1.85 verified both sidebar and Command Palette routes open the exact external Buy Me a Coffee URL without terminal, scan, storage, or command side effects. |
| MT-20 | PARTIAL | Scanner/storage/compatibility error paths are automated; manual no-workspace/removal UI behavior remains pending. |
| MT-21 | PARTIAL | Tree item labels/tooltips/support command are automated; only support-item keyboard evidence is recorded manually. |
| MT-22 | PARTIAL | Notification preference logic is automated; Settings UI verification remains pending. |
| MT-23 | PARTIAL | Deterministic nested/multi-root sidebar groups are automated; monorepo visual review remains pending. |
| MT-24 | PARTIAL | Manifest/package tests verify publisher, MIT, sponsor, icon and required package files; human documentation review remains pending. |
| MT-25 | PASS | Actual VS Code 1.85 manual smoke verified command inventory, sidebar refresh, scanning, Blueprint management cancellation, complete compatibility output/no-terminal behavior, Command Palette support navigation, approval/cancellation, auto-scan, notification preferences, and Restricted Mode. Automated 1.85 host testing remains NOT VERIFIED because of the documented environment failure. |

## Marketplace and package audit

- Publisher: `amalkali`; extension identifier: `amalkali.terminal-blueprint`.
- Version: `0.0.1` (unchanged).
- Engine: `^1.85.0`.
- License: MIT, with root `LICENSE` and packaged `LICENSE.txt`.
- Sponsor URL: `https://buymeacoffee.com/amaljithkab`.
- Repository, homepage, issue URLs, commands, Activity Bar container, Tree View, and SVG Activity Bar icon are present. The Marketplace manifest points to the packaged 256x256 PNG icon.
- `package.json` intentionally has no `capabilities.untrustedWorkspaces` declaration. VS Code consequently applies its secure default and disables the extension in Restricted Mode; this matches observed 1.85 behavior and does not weaken security.
- Auto Scan deliberately uses `SidebarDataController.refresh()` rather than the manual Scan Project command. It refreshes sidebar data without writing to the Output channel; this explains the observed silent automatic scan and is intentional.
- No runtime dependencies are declared.
- Read-only source scan found no hardcoded credentials, API keys, tokens, private keys, or local user paths outside test/documentation wording.
- `.vscodeignore` excludes TypeScript source, tests, docs, development configuration, maps, node modules, environment files, agent artifacts, and generated VSIX files.

## VSIX verification

- Path: `D:\vscode-extensions\terminal-blueprint\terminal-blueprint-0.0.1.vsix`
- Size: **57,744 bytes** (56.39 KB reported by `vsce`).
- SHA-256: `F5477AC8E67C40BF6E4E7C0D70396DF506A716B70F60F9E31476259115E46129`.
- Packaging tool: transient `@vscode/vsce`; it was not added to the repository dependencies.
- Contents: **39 files**, limited to package metadata, README/changelog/license, compiled `out/**/*.js`, and `resources/terminal-blueprint.{png,svg}`.
- No source TypeScript, tests, fixture directories, source maps, `node_modules`, `.git`, docs, environment files, or credential material was included.
- The VSIX installed successfully into the isolated profile at `D:\terminal-blueprint-vsix-smoke\extensions\amalkali.terminal-blueprint-0.0.1`.
- `code --list-extensions --show-versions` against that isolated profile reports `amalkali.terminal-blueprint@0.0.1`.
- The final VSIX installed successfully through the local VS Code 1.85 CLI into the fresh isolated directory `D:\terminal-blueprint-vscode185-smoke\extensions-release-final-2`; the CLI reports `amalkali.terminal-blueprint@0.0.1`.
- The final rebuilt archive contains 39 files and was inspected after packaging: no TypeScript source, test output, or source maps; manifest confirms `amalkali.terminal-blueprint`, 0.0.1, `^1.85.0`, MIT, the configured sponsor URL, and `resources/terminal-blueprint.png` as the Marketplace icon. Both the 256x256 PNG and SVG Activity Bar icon are packaged.
- Archive comparison confirms the packaged compiled runtime, manifest, icons, changelog, and license match the current files. `vsce` rewrites the README's relative LICENSE link to the public repository URL during packaging; that expected link normalization is the only README byte difference.
- Installed-VSIX manual smoke evidence confirms activation, sidebar display, project detection, final-approval preview, cancellation without a terminal, and an approved `npm run marker` execution in `D:\terminal-blueprint-safe-fixture`. This does not replace the remaining complete minimum-version smoke set.

## Remaining release blockers

None. Optional manual polish remains for detailed sidebar visuals, the remaining Blueprint-management interactions, broader ecosystem UI scans, import/export dialogs, Settings UI, no-workspace handling, and Marketplace screenshots.

No Marketplace publishing, Git write, version bump, or release creation was performed.

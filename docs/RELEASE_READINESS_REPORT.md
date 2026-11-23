# Release Readiness Report

**Prepared:** 2026-11-23  
**Candidate:** `amalkali.terminal-blueprint` 0.0.1  
**Recommendation:** **NO-GO** for Marketplace publication until the remaining manual P0 checks and the VS Code 1.85 smoke test are completed.

## Changes in this release-preparation work

- Hardened Gradle detection so a `build.gradle`/`build.gradle.kts` file is not trusted merely because it exists.
- Added conservative, static recognition of supported Groovy/Kotlin Gradle build constructs. Blank, whitespace-only, comments-only, unrelated, and unbalanced build metadata is rejected without evaluating Gradle.
- Removed the resulting `gradle tasks` suggestion for rejected metadata.
- Added Java scanner and scanner-to-suggestion regression coverage.

Pre-existing uncommitted work was preserved: the manual checklist updates, Blueprint mixed-command whitespace handling, and Output-channel focus preservation.

## Automated validation

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript compile | PASS | `npm run compile` |
| ESLint | PASS | `npm run lint` |
| Extension-host regression suite | PASS | `npm test -- --code-version 1.146.0`: **144 passing, 0 failing** |
| VS Code 1.85 extension-host suite | NOT VERIFIED | Local `D:\VSCode-win32-x64-1.85.0\Code.exe` reports `1.85.0`, commit `af28b32d7e553898b2a91af498b1fb666fdebe0c`, x64. The supported `@vscode/test-electron` API was invoked with that exact executable and fresh isolated profiles. Both runs exited code 1 before the test runner loaded. The local host reports `EPERM: operation not permitted, mkdir ...\\user-data-tests\\logs\\<timestamp>`; the same failure occurred with a separate prior profile. This is an automated-host filesystem permission failure, not a product test result. No newer-version result was substituted. |

The 1.146 test-host logs included unrelated VS Code cache, bundled-extension API-proposal, account, and deprecation warnings. They did not produce extension test failures.

## MT-01 through MT-25 evidence

`PASS` is reserved for observed manual evidence already recorded in `MANUAL_TEST_CHECKLIST.md`. Automated tests strengthen evidence but do not replace manual UI checks.

| ID | Status | Evidence |
| --- | --- | --- |
| MT-01 | PARTIAL | Command contributions and activation are covered by package/tree tests; installed-VSIX activation and sidebar display were manually observed, but Command Palette coverage remains incomplete. |
| MT-02 | PARTIAL | Scanner/suggestion tests are side-effect free; installed-VSIX project detection was manually observed, but the no-terminal scan observation remains incomplete. |
| MT-03 | PASS | Recorded manual cancel/approve test: one command, one terminal, correct directory. |
| MT-04 | PASS | Recorded Restricted Mode observations block suggested and Blueprint execution. |
| MT-05 | PASS | Recorded nested/multi-root execution evidence with isolated directories. |
| MT-06 | PARTIAL | Controller tests cover mixed authorized/unauthorized commands, cancellation, and the final approval gate. In the latest 1.85 observation, `1 blueprint command(s) are unsupported` proves no independently authorized candidate was available, so the picker, preview, terminal, and `sendText` path were correctly unreachable; no execution is inferred. `COMPATIBLE` is advisory and does not validate stored command text. The stored entry must exactly match a safe, currently verified project suggestion and use the project root. The distinct final-approval preview remains manually unverified. |
| MT-07 | PARTIAL | Automated malformed metadata, symlink, unsafe script-name, and hardened Gradle tests pass; full manual scan evidence is pending. |
| MT-08 | PARTIAL | Automated automatic-scan/trust/notification tests pass; manual restricted and notification scenarios remain pending. |
| MT-09 | PARTIAL | Native tree hierarchy, actions, refresh, disposal, and no-terminal behavior are automated; visual interaction remains pending. |
| MT-10 | PARTIAL | npm/pnpm/Yarn/Bun/conflict behavior is automated; existing manual evidence covers only npm/Next.js. |
| MT-11 | PARTIAL | Python, Poetry, Pipenv, uv, Django, Flask, and FastAPI unit coverage passes; batch fixture UI observation remains pending. |
| MT-12 | PARTIAL | Composer/Laravel detection and safe Composer scripts are automated; batch fixture UI observation remains pending. |
| MT-13 | PARTIAL | Maven/Gradle/Kotlin/Spring detection and malformed Gradle/POM rejection are automated; batch fixture UI observation remains pending. |
| MT-14 | PARTIAL | Go/Cargo package/workspace and invalid manifest rejection are automated; batch fixture UI observation remains pending. |
| MT-15 | PARTIAL | CRUD, persistence, timestamps, duplication, deletion and no-terminal behavior are automated; only partial manual persistence evidence exists. |
| MT-16 | PARTIAL | Import/export, validation, duplicate policy, concurrency and I/O failures are automated; native dialog workflow remains pending. |
| MT-17 | PARTIAL | Compatibility selection/output/error tests pass; native Output-channel workflow remains pending. |
| MT-18 | PARTIAL | Depth, exclusions, nested roots, invalidation, and hard-bound tests pass; Settings UI observation remains pending. |
| MT-19 | PARTIAL | Support URL/open-failure behavior is automated; sidebar route has manual evidence, Command Palette route remains pending. |
| MT-20 | PARTIAL | Scanner/storage/compatibility error paths are automated; manual no-workspace/removal UI behavior remains pending. |
| MT-21 | PARTIAL | Tree item labels/tooltips/support command are automated; only support-item keyboard evidence is recorded manually. |
| MT-22 | PARTIAL | Notification preference logic is automated; Settings UI verification remains pending. |
| MT-23 | PARTIAL | Deterministic nested/multi-root sidebar groups are automated; monorepo visual review remains pending. |
| MT-24 | PARTIAL | Manifest/package tests verify publisher, MIT, sponsor, icon and required package files; human documentation review remains pending. |
| MT-25 | NOT VERIFIED | A supplied local 1.85.0 executable was verified and used, but its isolated automated host exited before tests due to `EPERM` creating its log directory. A direct human smoke session in that executable is still required. |

## Marketplace and package audit

- Publisher: `amalkali`; extension identifier: `amalkali.terminal-blueprint`.
- Version: `0.0.1` (unchanged).
- Engine: `^1.85.0`.
- License: MIT, with root `LICENSE` and packaged `LICENSE.txt`.
- Sponsor URL: `https://buymeacoffee.com/amaljithkab`.
- Repository, homepage, issue URLs, commands, Activity Bar container, Tree View, and SVG icon are present.
- No runtime dependencies are declared.
- Read-only source scan found no hardcoded credentials, API keys, tokens, private keys, or local user paths outside test/documentation wording.
- `.vscodeignore` excludes TypeScript source, tests, docs, development configuration, maps, node modules, environment files, agent artifacts, and generated VSIX files.

## VSIX verification

- Path: `D:\vscode-extensions\terminal-blueprint\terminal-blueprint-0.0.1.vsix`
- Size: **54,951 bytes** (53.66 KB reported by `vsce`).
- Packaging tool: transient `@vscode/vsce`; it was not added to the repository dependencies.
- Contents: **37 files**, limited to package metadata, README/changelog/license, compiled `out/**/*.js`, and `resources/terminal-blueprint.svg`.
- No source TypeScript, tests, fixture directories, source maps, `node_modules`, `.git`, docs, environment files, or credential material was included.
- The VSIX installed successfully into the isolated profile at `D:\terminal-blueprint-vsix-smoke\extensions\amalkali.terminal-blueprint-0.0.1`.
- `code --list-extensions --show-versions` against that isolated profile reports `amalkali.terminal-blueprint@0.0.1`.
- The same VSIX installed successfully through the local VS Code 1.85 CLI into `D:\terminal-blueprint-vscode185-smoke\extensions-tests`, and its CLI reports `amalkali.terminal-blueprint@0.0.1`.
- Installed-VSIX manual smoke evidence confirms activation, sidebar display, project detection, cancellation without a terminal, and an approved `npm run marker` execution in `D:\terminal-blueprint-safe-fixture`. The final approval preview was not independently captured; this does not prove all execution-flow UI states.

## Remaining release blockers

1. Complete the outstanding P0 manual checks: MT-01, MT-02, MT-06, MT-07, and MT-08.
2. Run the MT-25 smoke manually in the supplied VS Code **1.85.0** installation. The automated host cannot create its isolated log directory in this environment; do not substitute a newer release.
3. Recreate MT-06 from a displayed `npm run marker` suggestion using the exact text and project-root directory, then capture the distinct final approval preview.
4. Complete the remaining manual MT cases recorded as PARTIAL before Marketplace publication.

No Marketplace publishing, Git write, version bump, or release creation was performed.

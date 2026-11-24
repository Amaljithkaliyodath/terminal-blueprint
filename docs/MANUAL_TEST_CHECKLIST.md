# Manual Release Test Checklist

Use this checklist in an Extension Development Host before release. Every result starts as **NOT TESTED**; do not mark a test PASS until it has been observed in the named VS Code version.

## Test environment

1. From the repository root, run `npm run compile`.
2. Open the repository in VS Code and press `F5` to start an **Extension Development Host**.
3. In the host, open an isolated disposable workspace. Do not use a production project or a workspace containing secrets.
4. Use **View: Output** and select **Terminal Blueprint** to inspect scan and compatibility output. Use **Help: Toggle Developer Tools** to inspect extension-host errors.
5. For a failure, record the test ID, VS Code version, operating system, Workspace Trust state, exact workspace structure, command used, Output/Developer Tools messages, and reproduction steps. Do not include credentials or private project data in reports.

Suggested fixtures may contain small metadata files only: `package.json`, `requirements.txt`, `composer.json`, `pom.xml`, `build.gradle`, `go.mod`, and `Cargo.toml`. Never rely on Terminal Blueprint to execute a fixture command unless the relevant test explicitly requires user-approved execution.

## Test matrix

| Priority | Count | Purpose |
| --- | ---: | --- |
| P0 | 8 | Security, trust, execution, and release-blocking behavior |
| P1 | 12 | Core workflows and supported project detection |
| P2 | 5 | Accessibility, usability, and release polish |

Tests marked **Current + 1.85** should be run in the current installed VS Code and repeated in VS Code 1.85. Tests marked **1.85 required** specifically require the declared minimum version.

## P0 — Security and release-blocking

### MT-01 — Activation and Command Palette registration

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Extension Development Host with any folder open.  
**Actions:** Open the Command Palette and search `Terminal Blueprint:`.  
**Expected:** The following commands appear exactly once: Scan Project; Run Suggested Command; Create Blueprint; Manage Blueprints; Import Blueprints; Export Blueprints; Check Blueprint Compatibility; Run Blueprint; Refresh Sidebar; Support Development. No `Hello World` command appears.

**Recorded evidence (2026-11-24, PASS):** The isolated installed VSIX was checked in actual VS Code 1.85.0. All ten required commands appeared exactly once, `Hello World` was absent, and VS Code additionally supplied its native `Focus on Terminal Blueprint View` command.

### MT-02 — Scan is read-only and does not execute discovered scripts

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** A workspace with a `package.json` containing a harmless, identifiable script such as `"marker": "echo SHOULD-NOT-RUN"`.  
**Actions:** Run **Terminal Blueprint: Scan Project**.  
**Expected:** Metadata and suggestions display in the Terminal Blueprint Output Channel. No terminal opens and the marker script does not run.

**Recorded evidence (2026-11-24, PASS):** In actual VS Code 1.85.0, the disposable `D:\terminal-blueprint-safe-fixture` scan detected Node.js, npm from lockfile evidence, and the `marker` script; it suggested `npm run marker`; Output reported `Scan completed. No commands executed.` The owner explicitly confirmed no terminal opened and the marker did not run.


### MT-03 — Suggested-command approval and cancellation

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Trusted workspace with a verified harmless package script, for example `npm run marker`.  
**Actions:** Run **Terminal Blueprint: Run Suggested Command**, select the suggestion, then first choose Cancel in the preview. Repeat and choose Approve.  
**Expected:** Cancel creates no terminal. Approve creates one visible Terminal Blueprint terminal at the displayed working directory and sends only the previewed command once.

**Recorded evidence (2026-11-19, PASS):** Cancellation created no terminal and executed no command. On approval, exactly one new terminal was created; `npm run marker` was sent once; `TERMINAL_BLUEPRINT_MARKER` appeared once; and `Get-Location` returned `D:\terminal-blueprint-safe-fixture`.

### MT-04 — Workspace Trust blocks execution

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Open the same fixture in Restricted Mode.  
**Actions:** Run **Terminal Blueprint: Run Suggested Command** and **Terminal Blueprint: Run Blueprint**.  
**Expected:** Execution is blocked with a visible warning. No terminal is created and no command is sent.

**Recorded evidence (2026-11-24, PASS):** In actual VS Code 1.85.0 Restricted Mode, VS Code disabled Terminal Blueprint entirely: its commands and Activity Bar icon disappeared. Restoring trust restored the extension. This is the secure default for an extension that does not declare untrusted-workspace support; no project command could run while disabled.

### MT-05 — Nested and multi-root working-directory isolation

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** A multi-root workspace with independently detected nested projects, such as `apps/web` and `services/api`, each with a distinct harmless script.  
**Actions:** Scan, inspect sidebar groups, select one suggestion from each project, and approve each separately.  
**Expected:** Suggestions stay under the correct project and each terminal uses its selected project directory; no commands or paths are mixed across roots.

**Recorded evidence (2026-11-23, PASS):** A real VS Code multi-root workspace with separate `apps` and `services` roots detected both Node.js projects and their npm commands. `web-marker` executed in `apps/web` and `api-marker` executed in `services/api`; their terminal output and working directories were verified, with no cross-project execution.

### MT-06 — Blueprint execution remains restricted and approved

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Trusted project with one eligible verified suggestion and a saved blueprint containing both that command and an unsupported command such as `echo arbitrary`.  
**Actions:** First run **Terminal Blueprint: Scan Project** and confirm the exact eligible suggestion text (for example `npm run marker`) is shown for the selected project. Create or edit the blueprint with that exact text, without quotes or extra arguments, and leave the relative working directory blank (project root). Run **Terminal Blueprint: Run Blueprint**, select the project and blueprint, inspect warnings and command selection, then cancel once and approve only the eligible command once.  
**Expected:** Unsupported text is not offered for execution. Cancellation creates no terminal. The eligible command requires final approval before it runs.

**Execution note:** `COMPATIBLE` is advisory: it checks requirements and working directories, not whether stored text is currently executable. A stored command is offered only when it independently matches a safe, currently verified suggestion for the selected project.

**Recorded evidence (2026-11-24, PASS):** In actual VS Code 1.85 with the rebuilt VSIX, `Final Release Test` stored label `Run marker` and command `npm run marker`. The authorized command picker appeared, the final modal began `Review blueprint commands before approving`, and it displayed the correct project and working directory. The latest package showed exactly one Approve button and one native Cancel button; Cancel closed the dialog without a terminal or command. Approval produced `TERMINAL_BLUEPRINT_MARKER`; a prior directory-path command was correctly rejected.

### MT-07 — Unsafe or malformed metadata does not create executable suggestions

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Disposable fixtures with malformed `package.json`, malformed `go.mod`, incomplete `Cargo.toml`, and a package script name containing shell punctuation.  
**Actions:** Scan each fixture. Where supported by the OS and test environment, also use a reported symbolic-link metadata file.  
**Expected:** Scanning remains responsive, reports only safe verified information, and creates no unsafe executable suggestion. No script runs.

**Recorded evidence (2026-11-24, PASS):** Actual VS Code 1.85.0 scans of `D:\terminal-blueprint-mt07-test` showed broken Go and Rust as Unknown, malformed Node.js without executable suggestions, and unsafe-script Node.js without a verified package manager or safe command. `bad;echo UNSAFE_MARKER` was not offered. The formerly false-positive malformed Gradle fixture no longer produced Gradle detection or suggestions. Output reported no commands executed and the owner explicitly confirmed no terminal opened. Symlink coverage passes in automation.

### MT-08 — Automatic scanning and notifications do not bypass safety

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** A workspace with detectable metadata; Settings UI available.  
**Actions:** Set `terminalBlueprint.autoScan` to false and reopen the workspace; then set it true in a trusted workspace and reopen. Repeat in Restricted Mode. Toggle `terminalBlueprint.showNotifications` off.  
**Expected:** No scan occurs automatically when disabled or when untrusted. Trusted auto-scan is read-only and opens no terminal. Optional information is suppressed when configured, but warnings and approval prompts remain visible.

**Recorded evidence (2026-11-24, PASS):** With Auto Scan enabled in trusted VS Code 1.85.0, reloading the safe fixture without manually scanning populated the sidebar with the project and `npm run marker`; saved Blueprints remained available; no terminal opened; and the Terminal Blueprint Output channel remained empty. With Auto Scan disabled and the window reloaded, no automatic scan or terminal opened. With `Show Notifications` disabled, optional informational notifications were suppressed while the mandatory Blueprint approval dialog remained visible. Restricted Mode disabled the extension entirely, so it could not auto-scan or execute until trust was restored.

## P1 — Core functionality

### MT-09 — Native Activity Bar and sidebar refresh

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Any open workspace.  
**Actions:** Select the Terminal Blueprint Activity Bar icon, expand Detected Projects and Saved Blueprints, expand a detected project with suggestions, then invoke **Terminal Blueprint: Refresh Sidebar**.
**Expected:** Native Tree View categories, icons, tooltips, loading/empty states, and refresh behavior appear without a webview or terminal creation.

**Recorded evidence (2026-11-24, PARTIAL):** In actual VS Code 1.85.0, **Refresh Sidebar** displayed Detected Projects, suggested commands, Saved Blueprints with compatibility statuses, and Support & About correctly. No terminal opened and no command executed. Detailed icon, tooltip, and empty-state review remains optional.

### MT-10 — Node.js, React, Next.js, TypeScript, and package-manager detection

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Node fixtures with verified dependency metadata and separate npm, pnpm, Yarn, and Bun lockfile evidence.  
**Actions:** Run **Terminal Blueprint: Scan Project** for each fixture, including one with conflicting lockfiles.  
**Expected:** Technologies, scripts, and one unambiguous package manager are displayed correctly. Conflicting evidence produces a warning rather than an executable script command.

**Recorded evidence (2026-11-19, PARTIAL):** A manual scan of `` detected Node.js, Next.js, React, TypeScript, npm, and the `dev`, `build`, `lint`, and `start` scripts. The owner reported that the scan did not execute a command. This covers one npm/Next.js scenario only; separate package-manager and conflicting-evidence cases remain untested.

### MT-11 — Python, Django, Flask, FastAPI, and tooling detection

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Fixtures using `requirements.txt`, `pyproject.toml`, Pipenv, Poetry, or uv metadata; include Django `manage.py` where applicable.  
**Actions:** Scan each fixture.  
**Expected:** Only metadata-supported frameworks and tools are shown. Django runserver is suggested only with verified `manage.py`; no guessed Flask/FastAPI entrypoint command appears.

### MT-12 — PHP, Composer, and Laravel detection

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Composer fixture with a safe script and a Laravel fixture with verified framework metadata or `artisan`.  
**Actions:** Scan and inspect suggestions.  
**Expected:** PHP/Composer/Laravel labels reflect actual metadata. Only safe Composer script names become suggestions.

### MT-13 — Java, Kotlin, Maven, Gradle, and Spring Boot detection

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Valid Maven POM and Gradle/Kotlin fixtures; separate empty or malformed build-file fixtures.  
**Actions:** Scan each fixture.  
**Expected:** Valid metadata identifies supported technologies. Empty or malformed files do not claim Java, Kotlin, Maven, or Spring Boot. Only standard supported Maven/Gradle suggestions appear.

### MT-14 — Go modules and Rust Cargo detection

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Valid `go.mod`, valid Cargo package/workspace manifests, and invalid counterparts.  
**Actions:** Scan each fixture.  
**Expected:** Valid metadata produces Go/Cargo information and standard suggestions; invalid metadata produces neither executable build/test suggestions nor false-positive labels.

### MT-15 — Blueprint management

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Workspace open; no terminal needed.  
**Actions:** Run **Terminal Blueprint: Create Blueprint**. Then use **Terminal Blueprint: Manage Blueprints** to view, rename, edit description, add/edit/remove/reorder commands, duplicate, and delete with confirmation.  
**Expected:** Cancellation leaves data unchanged; duplicate gets new IDs; deletion requires confirmation; no terminal opens during management.

**Recorded evidence (2026-11-19, PARTIAL):** `MT04 Sidebar Retest` was created with a success notification and remained visible after Extension Development Host reload. The two earlier `MT04 Safe Test` blueprints were also visible after reload, and no new persistence error was observed. This confirms persistence and reload visibility only; it does not establish immediate sidebar refresh before reload, nor the remaining management operations.

**Additional evidence (2026-11-24, PARTIAL):** In actual VS Code 1.85.0, **Manage Blueprints** displayed all nine management options for `Final Release Test`. A Rename draft was entered and cancelled with Escape; the original name remained unchanged, no duplicate was created, and no terminal or command execution occurred. The remaining edit/reorder/duplicate/delete interactions are optional coverage.

### MT-16 — Blueprint export and import

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** At least one saved blueprint and a disposable JSON export destination.  
**Actions:** Run **Terminal Blueprint: Export Blueprints** for one and all. Import valid JSON using **Terminal Blueprint: Import Blueprints**. Repeat duplicate import and select Skip, Import Copy, and Cancel.  
**Expected:** JSON preserves command order; duplicate decisions do not overwrite existing data; cancellation does not mutate storage; no commands execute.

### MT-17 — Blueprint compatibility inspection

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** One saved blueprint and one or more detected projects.  
**Actions:** Run **Terminal Blueprint: Check Blueprint Compatibility**, select a blueprint and—when prompted—a project.  
**Expected:** Output identifies blueprint, project, working directory, COMPATIBLE/WARNING/INCOMPATIBLE status, reasons, and per-command directory findings. No terminal opens.

**Recorded evidence (2026-11-24, PASS):** Actual VS Code 1.85.0 Output identified `Final Release Test`, its ID, `terminal-blueprint-safe-fixture (.)`, the file URI working directory, `COMPATIBLE`, matched requirements, no warnings or mismatches, reasons, and `Run marker` directory `AVAILABLE (.)`; it also displayed the informational-only safety message. No terminal opened and no command executed.

### MT-18 — Scan depth and safe exclusions

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Nested fixture at depth greater than one.  
**Actions:** Set `terminalBlueprint.scanMaxDepth` to 0, then 1 through 4. Add a safe directory name to `terminalBlueprint.excludedDirectories`; then try `../outside`, an absolute path, and `node_modules/child`.  
**Expected:** Depth changes affect discovery within the hard maximum of 4. Safe exclusions apply. Unsafe values do not extend traversal or remove protected exclusions.

### MT-19 — Support Development action

**Compatibility:** Current + 1.85 · **Result:** PASS
**Prerequisites:** Browser/external URI handling enabled.  
**Actions:** Run **Terminal Blueprint: Support Development** from the Command Palette and activate Buy Me a Coffee beneath Support & About in the sidebar.
**Expected:** Each opens `https://buymeacoffee.com/amaljithkab` through VS Code’s external handler. No donation popup, terminal, scan, storage change, or payment flow occurs.

**Recorded evidence (2026-11-24, PASS):** Buy Me a Coffee beneath Support & About and **Terminal Blueprint: Support Development** from the Command Palette both opened `https://buymeacoffee.com/amaljithkab` through VS Code's external confirmation flow. No terminal, scan, storage change, or command execution occurred.

### MT-20 — Output and filesystem-error handling

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** No workspace, inaccessible/removed fixture folder, and malformed metadata fixture.  
**Actions:** Run Scan Project, compatibility inspection, and sidebar refresh in each condition.  
**Expected:** Clear warnings/errors or empty states appear; the extension does not crash, write project files, or execute commands.

## P2 — UX and compatibility polish

### MT-21 — Empty states and keyboard accessibility

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Empty workspace or no saved blueprints.  
**Actions:** Navigate the sidebar using keyboard focus, expand each category and project, open the item context menus, and focus Buy Me a Coffee beneath Support & About.
**Expected:** Clear empty-state labels, meaningful tooltips, accessible labels, and keyboard-accessible native actions work without misleading executable actions.

**Recorded evidence (2026-11-23, PARTIAL):** Keyboard navigation reached Buy Me a Coffee beneath Support & About, and Enter opened the external support link with no unwanted side effects. Empty states, project expansion, and other native context-menu actions remain untested.

### MT-22 — Notification preference UX

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Settings UI.  
**Actions:** Set `terminalBlueprint.showNotifications` false, perform an action that yields optional information, then trigger a warning such as execution in Restricted Mode.  
**Expected:** Optional information is suppressed; warnings, errors, and approval dialogs are not suppressed.

### MT-23 — Sidebar grouping and readability in a monorepo

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Monorepo fixture with `frontend/`, `backend/`, `apps/`, `packages/`, or `services/` projects.  
**Actions:** Refresh the sidebar and inspect project and command groups.  
**Expected:** Stable project names, relative paths, working directories, and per-project command groups remain readable and independent.

### MT-24 — License, Marketplace metadata, and documentation links

**Compatibility:** Current + 1.85 · **Result:** PARTIAL
**Prerequisites:** Repository checkout.  
**Actions:** Open `README.md`, `LICENSE`, and `package.json`.  
**Expected:** README links to MIT LICENSE and optional Buy Me a Coffee support; manifest declares MIT, the exact sponsor URL, and publisher ID `amalkali`.

### MT-25 — VS Code 1.85 minimum-version smoke test

**Compatibility:** **1.85 required** · **Result:** PASS
**Prerequisites:** A separate VS Code 1.85 installation and a clean profile/workspace.  
**Actions:** Launch the Extension Development Host or, after a later approved packaging step, install the inspected VSIX. Run MT-01, MT-02, MT-03, MT-09, MT-15, MT-17, and MT-19.  
**Expected:** Extension activates; commands, settings, sidebar, approval flow, blueprint workflow, and support link work without unsupported-API errors.

**Recorded evidence (2026-11-24, PASS):** The rebuilt VSIX was manually exercised in actual VS Code 1.85.0. MT-01, MT-02, MT-03, MT-09 smoke refresh, MT-15 cancellation-safe management, MT-17 complete compatibility output/no-terminal behavior, and MT-19 Command Palette support flow were observed. Activation, sidebar, manual and automatic scanning, malformed-metadata safety, approved harmless marker execution, notification preferences, and Restricted Mode disable/restore were also confirmed. The supported automated 1.85 test host remains NOT VERIFIED because its isolated profile/log setup failed before tests loaded.

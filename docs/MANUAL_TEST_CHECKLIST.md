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

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Extension Development Host with any folder open.  
**Actions:** Open the Command Palette and search `Terminal Blueprint:`.  
**Expected:** The following commands appear exactly once: Scan Project; Run Suggested Command; Create Blueprint; Manage Blueprints; Import Blueprints; Export Blueprints; Check Blueprint Compatibility; Run Blueprint; Refresh Sidebar; Support Development. No `Hello World` command appears.

### MT-02 — Scan is read-only and does not execute discovered scripts

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** A workspace with a `package.json` containing a harmless, identifiable script such as `"marker": "echo SHOULD-NOT-RUN"`.  
**Actions:** Run **Terminal Blueprint: Scan Project**.  
**Expected:** Metadata and suggestions display in the Terminal Blueprint Output Channel. No terminal opens and the marker script does not run.

### MT-03 — Suggested-command approval and cancellation

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Trusted workspace with a verified harmless package script, for example `npm run marker`.  
**Actions:** Run **Terminal Blueprint: Run Suggested Command**, select the suggestion, then first choose Cancel in the preview. Repeat and choose Approve.  
**Expected:** Cancel creates no terminal. Approve creates one visible Terminal Blueprint terminal at the displayed working directory and sends only the previewed command once.

### MT-04 — Workspace Trust blocks execution

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Open the same fixture in Restricted Mode.  
**Actions:** Run **Terminal Blueprint: Run Suggested Command** and **Terminal Blueprint: Run Blueprint**.  
**Expected:** Execution is blocked with a visible warning. No terminal is created and no command is sent.

### MT-05 — Nested and multi-root working-directory isolation

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** A multi-root workspace with independently detected nested projects, such as `apps/web` and `services/api`, each with a distinct harmless script.  
**Actions:** Scan, inspect sidebar groups, select one suggestion from each project, and approve each separately.  
**Expected:** Suggestions stay under the correct project and each terminal uses its selected project directory; no commands or paths are mixed across roots.

### MT-06 — Blueprint execution remains restricted and approved

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Trusted project with one eligible verified suggestion and a saved blueprint containing both that command and an unsupported command such as `echo arbitrary`.  
**Actions:** Run **Terminal Blueprint: Run Blueprint**, select the project and blueprint, inspect warnings and command selection, then cancel once and approve only the eligible command once.  
**Expected:** Unsupported text is not offered for execution. Cancellation creates no terminal. The eligible command requires final approval before it runs.

### MT-07 — Unsafe or malformed metadata does not create executable suggestions

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Disposable fixtures with malformed `package.json`, malformed `go.mod`, incomplete `Cargo.toml`, and a package script name containing shell punctuation.  
**Actions:** Scan each fixture. Where supported by the OS and test environment, also use a reported symbolic-link metadata file.  
**Expected:** Scanning remains responsive, reports only safe verified information, and creates no unsafe executable suggestion. No script runs.

### MT-08 — Automatic scanning and notifications do not bypass safety

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** A workspace with detectable metadata; Settings UI available.  
**Actions:** Set `terminalBlueprint.autoScan` to false and reopen the workspace; then set it true in a trusted workspace and reopen. Repeat in Restricted Mode. Toggle `terminalBlueprint.showNotifications` off.  
**Expected:** No scan occurs automatically when disabled or when untrusted. Trusted auto-scan is read-only and opens no terminal. Optional information is suppressed when configured, but warnings and approval prompts remain visible.

## P1 — Core functionality

### MT-09 — Native Activity Bar and sidebar refresh

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Any open workspace.  
**Actions:** Select the Terminal Blueprint Activity Bar icon, expand Detected Projects, Suggested Commands, and Saved Blueprints, then invoke **Terminal Blueprint: Refresh Sidebar**.  
**Expected:** Native Tree View categories, icons, tooltips, loading/empty states, and refresh behavior appear without a webview or terminal creation.

### MT-10 — Node.js, React, Next.js, TypeScript, and package-manager detection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Node fixtures with verified dependency metadata and separate npm, pnpm, Yarn, and Bun lockfile evidence.  
**Actions:** Run **Terminal Blueprint: Scan Project** for each fixture, including one with conflicting lockfiles.  
**Expected:** Technologies, scripts, and one unambiguous package manager are displayed correctly. Conflicting evidence produces a warning rather than an executable script command.

### MT-11 — Python, Django, Flask, FastAPI, and tooling detection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Fixtures using `requirements.txt`, `pyproject.toml`, Pipenv, Poetry, or uv metadata; include Django `manage.py` where applicable.  
**Actions:** Scan each fixture.  
**Expected:** Only metadata-supported frameworks and tools are shown. Django runserver is suggested only with verified `manage.py`; no guessed Flask/FastAPI entrypoint command appears.

### MT-12 — PHP, Composer, and Laravel detection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Composer fixture with a safe script and a Laravel fixture with verified framework metadata or `artisan`.  
**Actions:** Scan and inspect suggestions.  
**Expected:** PHP/Composer/Laravel labels reflect actual metadata. Only safe Composer script names become suggestions.

### MT-13 — Java, Kotlin, Maven, Gradle, and Spring Boot detection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Valid Maven POM and Gradle/Kotlin fixtures; separate empty or malformed build-file fixtures.  
**Actions:** Scan each fixture.  
**Expected:** Valid metadata identifies supported technologies. Empty or malformed files do not claim Java, Kotlin, Maven, or Spring Boot. Only standard supported Maven/Gradle suggestions appear.

### MT-14 — Go modules and Rust Cargo detection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Valid `go.mod`, valid Cargo package/workspace manifests, and invalid counterparts.  
**Actions:** Scan each fixture.  
**Expected:** Valid metadata produces Go/Cargo information and standard suggestions; invalid metadata produces neither executable build/test suggestions nor false-positive labels.

### MT-15 — Blueprint management

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Workspace open; no terminal needed.  
**Actions:** Run **Terminal Blueprint: Create Blueprint**. Then use **Terminal Blueprint: Manage Blueprints** to view, rename, edit description, add/edit/remove/reorder commands, duplicate, and delete with confirmation.  
**Expected:** Cancellation leaves data unchanged; duplicate gets new IDs; deletion requires confirmation; no terminal opens during management.

### MT-16 — Blueprint export and import

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** At least one saved blueprint and a disposable JSON export destination.  
**Actions:** Run **Terminal Blueprint: Export Blueprints** for one and all. Import valid JSON using **Terminal Blueprint: Import Blueprints**. Repeat duplicate import and select Skip, Import Copy, and Cancel.  
**Expected:** JSON preserves command order; duplicate decisions do not overwrite existing data; cancellation does not mutate storage; no commands execute.

### MT-17 — Blueprint compatibility inspection

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** One saved blueprint and one or more detected projects.  
**Actions:** Run **Terminal Blueprint: Check Blueprint Compatibility**, select a blueprint and—when prompted—a project.  
**Expected:** Output identifies blueprint, project, working directory, COMPATIBLE/WARNING/INCOMPATIBLE status, reasons, and per-command directory findings. No terminal opens.

### MT-18 — Scan depth and safe exclusions

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Nested fixture at depth greater than one.  
**Actions:** Set `terminalBlueprint.scanMaxDepth` to 0, then 1 through 4. Add a safe directory name to `terminalBlueprint.excludedDirectories`; then try `../outside`, an absolute path, and `node_modules/child`.  
**Expected:** Depth changes affect discovery within the hard maximum of 4. Safe exclusions apply. Unsafe values do not extend traversal or remove protected exclusions.

### MT-19 — Support Development action

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Browser/external URI handling enabled.  
**Actions:** Run **Terminal Blueprint: Support Development** and activate Support Development beneath Saved Blueprints.  
**Expected:** Each opens `https://buymeacoffee.com/amaljithkab` through VS Code’s external handler. No donation popup, terminal, scan, storage change, or payment flow occurs.

### MT-20 — Output and filesystem-error handling

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** No workspace, inaccessible/removed fixture folder, and malformed metadata fixture.  
**Actions:** Run Scan Project, compatibility inspection, and sidebar refresh in each condition.  
**Expected:** Clear warnings/errors or empty states appear; the extension does not crash, write project files, or execute commands.

## P2 — UX and compatibility polish

### MT-21 — Empty states and keyboard accessibility

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Empty workspace or no saved blueprints.  
**Actions:** Navigate the sidebar using keyboard focus and expand each category. Focus the Support Development item.  
**Expected:** Clear empty-state labels, meaningful tooltips, accessible labels, and keyboard activation work without misleading executable actions.

### MT-22 — Notification preference UX

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Settings UI.  
**Actions:** Set `terminalBlueprint.showNotifications` false, perform an action that yields optional information, then trigger a warning such as execution in Restricted Mode.  
**Expected:** Optional information is suppressed; warnings, errors, and approval dialogs are not suppressed.

### MT-23 — Sidebar grouping and readability in a monorepo

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Monorepo fixture with `frontend/`, `backend/`, `apps/`, `packages/`, or `services/` projects.  
**Actions:** Refresh the sidebar and inspect project and command groups.  
**Expected:** Stable project names, relative paths, working directories, and per-project command groups remain readable and independent.

### MT-24 — License, Marketplace metadata, and documentation links

**Compatibility:** Current + 1.85 · **Result:** NOT TESTED  
**Prerequisites:** Repository checkout.  
**Actions:** Open `README.md`, `LICENSE`, and `package.json`.  
**Expected:** README links to MIT LICENSE and optional Buy Me a Coffee support; manifest declares MIT and the exact sponsor URL; no Marketplace publisher ID is claimed.

### MT-25 — VS Code 1.85 minimum-version smoke test

**Compatibility:** **1.85 required** · **Result:** NOT TESTED  
**Prerequisites:** A separate VS Code 1.85 installation and a clean profile/workspace.  
**Actions:** Launch the Extension Development Host or, after a later approved packaging step, install the inspected VSIX. Run MT-01, MT-02, MT-03, MT-09, MT-15, MT-17, and MT-19.  
**Expected:** Extension activates; commands, settings, sidebar, approval flow, blueprint workflow, and support link work without unsupported-API errors.

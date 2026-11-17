import * as assert from 'assert';
import { AutomaticScanController } from '../config/automaticScanController';
import { TerminalBlueprintInformationService, TerminalBlueprintSettings } from '../config/terminalBlueprintConfiguration';

suite('Automatic Scan Controller', () => {
    test('does not scan by default, without a workspace, or in an untrusted workspace', () => {
        const target = createTarget(); const settings = fixture({ autoScan: false }); const environment = createEnvironment(settings);
        const controller = new AutomaticScanController(target, environment); controller.onActivation();
        assert.strictEqual(target.refreshes, 0);
        const enabledSettings = { ...settings, autoScan: true }; environment.workspace = false; controller.onConfigurationChanged(enabledSettings);
        assert.strictEqual(target.refreshes, 0);
        environment.workspace = true; environment.trusted = false; controller.onWorkspaceTrustGranted();
        assert.strictEqual(target.refreshes, 0);
        controller.dispose();
    });

    test('scans once for trusted activation, setting enablement, trust grant, and workspace changes', () => {
        const target = createTarget(); const settings = fixture({ autoScan: true }); const environment = createEnvironment(settings);
        const controller = new AutomaticScanController(target, environment); controller.onActivation();
        assert.strictEqual(target.refreshes, 1);
        controller.onWorkspaceFoldersChanged(); assert.strictEqual(target.invalidations, 1); assert.strictEqual(target.refreshes, 2);
        environment.trusted = false; controller.onWorkspaceFoldersChanged(); assert.strictEqual(target.refreshes, 2);
        environment.trusted = true; controller.onWorkspaceTrustGranted(); assert.strictEqual(target.refreshes, 3);
        controller.dispose(); controller.onWorkspaceFoldersChanged(); assert.strictEqual(target.refreshes, 3);
    });

    test('invalidates stale data when settings change and does not scan after disabling auto-scan', () => {
        const target = createTarget(); let settings = fixture({ autoScan: false }); const environment = createEnvironment(settings);
        const controller = new AutomaticScanController(target, environment);
        settings = { ...settings, autoScan: true }; controller.onConfigurationChanged(settings); assert.strictEqual(target.refreshes, 1);
        settings = { ...settings, scanMaxDepth: 2 }; controller.onConfigurationChanged(settings); assert.strictEqual(target.invalidations, 1); assert.strictEqual(target.refreshes, 2);
        settings = { ...settings, autoScan: false }; controller.onConfigurationChanged(settings); assert.strictEqual(target.invalidations, 2); assert.strictEqual(target.refreshes, 2);
        controller.dispose();
    });

    test('respects informational notification preference without suppressing required UI paths', () => {
        const messages: string[] = []; let show = true;
        const service = new TerminalBlueprintInformationService(() => fixture({ showNotifications: show }), { showInformationMessage(message) { messages.push(message); return Promise.resolve(undefined); } });
        service.show('optional'); show = false; service.show('suppressed');
        assert.deepStrictEqual(messages, ['optional']);
    });
});

function fixture(overrides: Partial<TerminalBlueprintSettings> = {}): TerminalBlueprintSettings { return { autoScan: false, showNotifications: true, scanMaxDepth: 4, excludedDirectories: ['.git'], ...overrides }; }
function createTarget(): { refreshes: number; invalidations: number; refresh(): Promise<void>; invalidate(): void } { return { refreshes: 0, invalidations: 0, async refresh() { this.refreshes += 1; }, invalidate() { this.invalidations += 1; } }; }
function createEnvironment(settings: TerminalBlueprintSettings): { workspace: boolean; trusted: boolean; readSettings(): TerminalBlueprintSettings; hasWorkspace(): boolean; isWorkspaceTrusted(): boolean } { return { workspace: true, trusted: true, readSettings() { return settings; }, hasWorkspace() { return this.workspace; }, isWorkspaceTrusted() { return this.trusted; } }; }

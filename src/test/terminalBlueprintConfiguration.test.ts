import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    DEFAULT_SCAN_MAX_DEPTH,
    MANDATORY_EXCLUDED_DIRECTORIES,
    TerminalBlueprintConfigurationService,
    readTerminalBlueprintSettings
} from '../config/terminalBlueprintConfiguration';

suite('Terminal Blueprint Configuration', () => {
    test('declares native settings with safe defaults', () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as { contributes: { configuration: { properties: Record<string, { default: unknown }> } } };
        const properties = manifest.contributes.configuration.properties;
        assert.strictEqual(properties['terminalBlueprint.autoScan'].default, false);
        assert.strictEqual(properties['terminalBlueprint.showNotifications'].default, true);
        assert.strictEqual(properties['terminalBlueprint.scanMaxDepth'].default, DEFAULT_SCAN_MAX_DEPTH);
        assert.deepStrictEqual(properties['terminalBlueprint.excludedDirectories'].default, [...MANDATORY_EXCLUDED_DIRECTORIES]);
    });

    test('reads valid settings and normalizes exclusions without weakening mandatory exclusions', () => {
        const settings = readTerminalBlueprintSettings(configuration({ autoScan: true, showNotifications: false, scanMaxDepth: 2, excludedDirectories: ['Custom', 'custom', '.git', '../escape', 'node_modules/child'] }));
        assert.strictEqual(settings.autoScan, true); assert.strictEqual(settings.showNotifications, false); assert.strictEqual(settings.scanMaxDepth, 2);
        assert.ok(settings.excludedDirectories.includes('custom'));
        assert.strictEqual(settings.excludedDirectories.filter((entry) => entry === 'custom').length, 1);
        assert.ok(MANDATORY_EXCLUDED_DIRECTORIES.every((entry) => settings.excludedDirectories.includes(entry)));
        assert.ok(!settings.excludedDirectories.includes('../escape'));
    });

    test('uses safe defaults for missing, malformed, fractional, and out-of-range values', () => {
        for (const values of [{}, { autoScan: 'yes', showNotifications: 1, scanMaxDepth: 1.5, excludedDirectories: 'node_modules' }, { scanMaxDepth: -1 }, { scanMaxDepth: 5 }]) {
            const settings = readTerminalBlueprintSettings(configuration(values));
            assert.strictEqual(settings.autoScan, false); assert.strictEqual(settings.showNotifications, true); assert.strictEqual(settings.scanMaxDepth, DEFAULT_SCAN_MAX_DEPTH);
        }
    });

    test('emits only Terminal Blueprint configuration changes and disposes its listener', () => {
        const api = configurationApi({ scanMaxDepth: 1 }); const service = new TerminalBlueprintConfigurationService(api);
        const received: number[] = []; const subscription = service.onDidChange((settings) => received.push(settings.scanMaxDepth));
        api.fire('editor.fontSize'); api.fire('terminalBlueprint.scanMaxDepth');
        assert.deepStrictEqual(received, [1]);
        service.dispose(); api.fire('terminalBlueprint.autoScan');
        assert.deepStrictEqual(received, [1]);
        subscription.dispose();
    });

    test('does not scan workspaces or create terminals while reading settings', () => {
        const terminalCount = vscode.window.terminals.length;
        readTerminalBlueprintSettings(configuration({ autoScan: true }));
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

function configuration(values: Record<string, unknown>): { get<T>(section: string): T | undefined } { return { get<T>(section: string) { return values[section] as T | undefined; } }; }
function configurationApi(values: Record<string, unknown>): { getConfiguration(): ReturnType<typeof configuration>; onDidChangeConfiguration(listener: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable; fire(section: string): void } {
    let listener: ((event: vscode.ConfigurationChangeEvent) => void) | undefined;
    return {
        getConfiguration() { return configuration(values); },
        onDidChangeConfiguration(next) { listener = next; return { dispose() { listener = undefined; } }; },
        fire(section) { listener?.({ affectsConfiguration: (target: string) => section === target || section.startsWith(`${target}.`) } as vscode.ConfigurationChangeEvent); }
    };
}

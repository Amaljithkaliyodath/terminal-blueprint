import * as assert from 'assert';
import { scanProjectsWithSettings } from '../scanner/configuredProjectScanner';
import { DEFAULT_SCAN_MAX_DEPTH, MANDATORY_EXCLUDED_DIRECTORIES, TerminalBlueprintSettings } from '../config/terminalBlueprintConfiguration';
import { ScanLimits } from '../scanner/projectScanner';

suite('Configured Project Scanner', () => {
    test('passes validated depth and mandatory exclusions to every configured scan', async () => {
        let received: ScanLimits | undefined;
        const settings: TerminalBlueprintSettings = { autoScan: false, showNotifications: true, scanMaxDepth: 0, excludedDirectories: [...MANDATORY_EXCLUDED_DIRECTORIES, 'generated'] };
        await scanProjectsWithSettings(() => settings, async (limits) => { received = limits; return []; });
        assert.strictEqual(received?.maxDepth, 0);
        assert.strictEqual(received?.maxDirectories, 500);
        assert.ok(received?.excludedDirectoryNames?.includes('.git'));
        assert.ok(received?.excludedDirectoryNames?.includes('generated'));
    });

    test('does not scan automatically or execute commands while adapting settings', async () => {
        let calls = 0;
        const settings: TerminalBlueprintSettings = { autoScan: true, showNotifications: true, scanMaxDepth: DEFAULT_SCAN_MAX_DEPTH, excludedDirectories: [...MANDATORY_EXCLUDED_DIRECTORIES] };
        assert.strictEqual(calls, 0);
        await scanProjectsWithSettings(() => settings, async () => { calls += 1; return []; });
        assert.strictEqual(calls, 1);
    });
});

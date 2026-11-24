import * as assert from 'assert';
import * as vscode from 'vscode';
import { BlueprintExecutionUi, selectAndRunBlueprint } from '../launcher/blueprintExecutionController';
import { TerminalService } from '../launcher/commandSelectionController';
import { TerminalTracker } from '../launcher/terminalLifecycleManager';
import { CompatibilityFileSystem } from '../compatibility/blueprintCompatibilityEngine';
import { TERMINAL_BLUEPRINT_SCHEMA_VERSION, TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';

suite('Blueprint Execution Controller', () => {
    test('executes only independently authorized selected commands in saved order after approval', async () => {
        const terminals = terminalService(); const tracker = terminalTracker(); const ui = executionUi({ selected: ['build', 'dev'], approved: true });
        const result = await run(blueprint(['build', 'dev']), project(), ui, directories(['/workspace/project']), terminals, tracker);
        assert.strictEqual(result, 'executed');
        assert.deepStrictEqual(terminals.commands, ['npm run build', 'npm run dev']);
        assert.deepStrictEqual(terminals.directories, ['/workspace/project', '/workspace/project']);
        assert.strictEqual(ui.preview?.plans.length, 2);
        assert.ok(ui.preview?.message.includes('Compatibility: COMPATIBLE'));
    });

    test('rejects unsupported stored text and never executes after cancellation or missing approval', async () => {
        const terminals = terminalService();
        const unsupported = blueprint(['dev']); unsupported.commands[0].command = 'npm run dev && injected';
        assert.strictEqual(await run(unsupported, project(), executionUi(), directories(['/workspace/project']), terminals, terminalTracker()), 'no-authorized-commands');
        const directoryEnteredAsCommand = blueprint(['marker']); directoryEnteredAsCommand.commands[0].command = 'D:\\terminal-blueprint-safe-fixture';
        const markerProject = project({ scripts: [{ name: 'marker', command: 'echo TERMINAL_BLUEPRINT_MARKER' }] });
        const directoryUi = executionUi();
        assert.strictEqual(await run(directoryEnteredAsCommand, markerProject, directoryUi, directories(['/workspace/project']), terminals, terminalTracker()), 'no-authorized-commands');
        assert.ok(directoryUi.warnings.includes('Terminal Blueprint: 1 blueprint command(s) are unsupported and cannot be executed.'));
        assert.strictEqual(await run(blueprint(['dev']), project(), executionUi({ selected: ['dev'], approved: false }), directories(['/workspace/project']), terminals, terminalTracker()), 'cancelled');
        assert.deepStrictEqual(terminals.commands, []);
    });

    test('offers independently verified commands from a mixed blueprint and preserves cancellation', async () => {
        const mixed = blueprint(['marker', 'unsupported-one', 'unsupported-two']);
        mixed.commands[0].command = '\tnpm run marker  ';
        mixed.commands[1].command = 'echo arbitrary';
        mixed.commands[2].command = 'echo arbitrary';
        const target = project({ scripts: [{ name: 'marker', command: 'echo TERMINAL_BLUEPRINT_MARKER' }] });
        const cancelledUi = executionUi({ selected: ['marker'], approved: false });
        const cancelledTerminals = terminalService();

        assert.strictEqual(await run(mixed, target, cancelledUi, directories(['/workspace/project']), cancelledTerminals, terminalTracker()), 'cancelled');
        assert.deepStrictEqual(cancelledUi.pickedCommandIds, ['marker']);
        assert.ok(cancelledUi.warnings.includes('Terminal Blueprint: 2 blueprint command(s) are unsupported and cannot be executed.'));
        assert.deepStrictEqual(cancelledTerminals.commands, []);

        const approvedUi = executionUi({ selected: ['marker'], approved: true });
        const approvedTerminals = terminalService();
        assert.strictEqual(await run(mixed, target, approvedUi, directories(['/workspace/project']), approvedTerminals, terminalTracker()), 'executed');
        assert.deepStrictEqual(approvedTerminals.commands, ['npm run marker']);
    });

    test('reports compatibility before opening the safe command picker for a mixed blueprint', async () => {
        const mixed = blueprint(['marker', 'unsupported']);
        mixed.commands[0].command = ' npm run marker ';
        mixed.commands[1].command = 'echo arbitrary';
        const target = project({ scripts: [{ name: 'marker', command: 'echo TERMINAL_BLUEPRINT_MARKER' }] });
        const events: string[] = [];
        const ui = executionUi({ selected: ['marker'], approved: false });
        const originalPickCommands = ui.pickCommands;
        ui.pickCommands = async (items) => {
            events.push(`picker:${items.map((item) => item.commandId).join(',')}`);
            return originalPickCommands.call(ui, items);
        };

        assert.strictEqual(
            await selectAndRunBlueprint(storage(mixed), async () => [target], () => true, ui, directories(['/workspace/project']), terminalService(), terminalTracker(), () => events.push('compatibility')),
            'cancelled'
        );
        assert.deepStrictEqual(events, ['compatibility', 'picker:marker']);
        assert.ok(ui.warnings.includes('Terminal Blueprint: 1 blueprint command(s) are unsupported and cannot be executed.'));
    });

    test('requires warning acknowledgement and incompatible override without treating either as approval', async () => {
        const warningBlueprint = blueprint(['dev']); warningBlueprint.packageManagerHint = 'npm';
        const ambiguous = project({ packageManager: { candidates: ['npm', 'pnpm'], source: 'lockfile', isAmbiguous: true } });
        assert.strictEqual(await run(warningBlueprint, ambiguous, executionUi({ warning: false }), directories(['/workspace/project']), terminalService(), terminalTracker()), 'cancelled');

        const incompatible = blueprint(['dev']); incompatible.technologyHints = ['PHP'];
        assert.strictEqual(await run(incompatible, project(), executionUi({ override: false }), directories(['/workspace/project']), terminalService(), terminalTracker()), 'incompatible');
        const terminals = terminalService();
        assert.strictEqual(await run(incompatible, project(), executionUi({ override: true, selected: ['dev'], approved: true }), directories(['/workspace/project']), terminals, terminalTracker()), 'executed');
        assert.deepStrictEqual(terminals.commands, ['npm run dev']);
    });

    test('blocks untrusted, unsafe, and changed directories before terminal creation', async () => {
        const terminals = terminalService();
        assert.strictEqual(await run(blueprint(['dev']), project(), executionUi({ selected: ['dev'], approved: true }), directories(['/workspace/project']), terminals, terminalTracker(), false), 'untrusted-workspace');
        const unsafe = blueprint(['dev']); unsafe.commands[0].relativeWorkingDirectory = '../escape';
        assert.strictEqual(await run(unsafe, project(), executionUi(), directories(['/workspace/project']), terminals, terminalTracker()), 'working-directory-unavailable');
        let available = true;
        const changing: CompatibilityFileSystem = { async stat(uri) { if (!available || uri.path !== '/workspace/project') { throw Object.assign(new Error('missing'), { code: 'FileNotFound' }); } return directoryStat(); } };
        const ui = executionUi({ selected: ['dev'], approved: true, onApproval() { available = false; } });
        assert.strictEqual(await run(blueprint(['dev']), project(), ui, changing, terminals, terminalTracker()), 'working-directory-unavailable');
        assert.deepStrictEqual(terminals.commands, []);
    });

    test('keeps nested projects isolated and leaves selection cancellation side-effect free', async () => {
        const nested = project({ name: 'web', relativePath: 'apps/web', workingDirectory: vscode.Uri.parse('memfs:/first/apps/web') });
        const other = project({ name: 'api', relativePath: 'services/api', workingDirectory: vscode.Uri.parse('memfs:/second/services/api') });
        const terminals = terminalService();
        const ui = executionUi({ selected: ['dev'], approved: true, project: other });
        const result = await selectAndRunBlueprint(storage(blueprint(['dev'])), async () => [nested, other], () => true, ui, directories(['/first/apps/web', '/second/services/api']), terminals, terminalTracker(), () => undefined);
        assert.strictEqual(result, 'executed');
        assert.deepStrictEqual(terminals.directories, ['/second/services/api']);
        assert.strictEqual(await run(blueprint(['dev']), project(), executionUi({ blueprint: undefined }), directories(['/workspace/project']), terminalService(), terminalTracker()), 'cancelled');
    });
});

async function run(value: TerminalBlueprint, target: ProjectInfo, ui: TestUi, fileSystem: CompatibilityFileSystem, terminals: TestTerminalService, tracker: TerminalTracker, trusted = true): Promise<unknown> {
    return selectAndRunBlueprint(storage(value), async () => [target], () => trusted, ui, fileSystem, terminals, tracker, () => undefined);
}
function blueprint(ids: string[]): TerminalBlueprint { return { id: 'blueprint', name: 'Blueprint', schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', commands: ids.map((id) => ({ id, label: id, command: `npm run ${id}` })), technologyHints: ['Node.js ecosystem'] }; }
function storage(value: TerminalBlueprint): { load(): Promise<TerminalBlueprintStorageDocument> } { return { async load() { return { schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints: [value] }; } }; }
function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo { return { name: 'project', relativePath: '.', workingDirectory: vscode.Uri.parse('memfs:/workspace/project'), technologies: ['Node.js ecosystem'], packageManager: { name: 'npm', candidates: ['npm'], source: 'lockfile', isAmbiguous: false }, scripts: [{ name: 'dev', command: 'node dev.js' }, { name: 'build', command: 'node build.js' }], composerScripts: [], hasDjangoManagePy: false, ...overrides }; }
function directories(paths: readonly string[]): CompatibilityFileSystem { return { async stat(uri) { if (!paths.includes(uri.path)) { throw Object.assign(new Error('missing'), { code: 'FileNotFound' }); } return directoryStat(); } }; }
function directoryStat(): vscode.FileStat { return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }; }

interface TestUi extends BlueprintExecutionUi { preview?: { plans: readonly unknown[]; message: string }; pickedCommandIds?: string[]; warnings: string[]; }
function executionUi(options: { blueprint?: string | undefined; project?: ProjectInfo; selected?: string[]; warning?: boolean; override?: boolean; approved?: boolean; onApproval?: () => void } = {}): TestUi { return {
    async pickBlueprint(items) { return options.blueprint === undefined && 'blueprint' in options ? undefined : items[0]?.blueprint; },
    async pickProject(items) { return options.project ?? items[0]?.project; },
    async pickCommands(items) { this.pickedCommandIds = items.map((item) => item.commandId); return options.selected; },
    async acknowledgeWarning() { return options.warning ?? true; },
    async confirmIncompatibleOverride() { return options.override ?? true; },
    async requestApproval(preview) { this.preview = preview; options.onApproval?.(); return options.approved ?? false; },
    warnings: [], showWarning(message) { this.warnings.push(message); }, showInformation() {}
}; }

interface TestTerminalService extends TerminalService { commands: string[]; directories: string[]; }
function terminalService(): TestTerminalService { return { commands: [], directories: [], createTerminal(options) { this.directories.push(options.cwd.path); return { sendText: (text) => this.commands.push(text), show() {} }; } }; }
function terminalTracker(): TerminalTracker { return { createTerminalName(projectName, command) { return `${projectName}:${command}`; }, track() {} }; }

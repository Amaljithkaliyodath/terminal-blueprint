import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    CommandPreview,
    CommandSelectionUi,
    createCommandPreview,
    createSuggestedCommandItems,
    isSafeSuggestionForExecution,
    selectAndRunSuggestedCommand,
    SuggestedCommandQuickPickItem,
    TerminalService,
    WorkingDirectoryVerifier
} from '../launcher/commandSelectionController';
import { TerminalTracker } from '../launcher/terminalLifecycleManager';
import { CommandSuggestion } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';

suite('Command Selection Controller', () => {
    test('maps a suggestion to its exact project and working directory', () => {
        const suggestion = createSuggestion({
            project: createProject({ name: 'web', relativePath: 'apps/web', workingDirectory: vscode.Uri.parse('file:///workspace/apps/web') })
        });
        const [item] = createSuggestedCommandItems([suggestion]);
        const preview = createCommandPreview(suggestion);

        assert.strictEqual(item.suggestion, suggestion);
        assert.ok(item.description.includes('web (apps/web)'));
        assert.ok(item.detail.includes(suggestion.workingDirectory.fsPath));
        assert.strictEqual(preview.workingDirectory, suggestion.workingDirectory);
        assert.ok(preview.message.includes('Command: npm run dev'));
        assert.ok(preview.message.includes('Source: package.json script'));
    });

    test('creates one visible terminal and sends the exact approved command once', async () => {
        const ui = createUi({ approved: true });
        const terminalService = createTerminalService();
        const tracker = createTerminalTracker();
        const result = await selectAndRunSuggestedCommand([createSuggestion()], () => true, ui, availableDirectory, terminalService, tracker);

        assert.strictEqual(result, 'executed');
        assert.strictEqual(ui.preview?.command, 'npm run dev');
        assert.strictEqual(terminalService.created.length, 1);
        assert.deepStrictEqual(terminalService.created[0].sentCommands, ['npm run dev']);
        assert.strictEqual(terminalService.created[0].showCount, 1);
        assert.strictEqual(terminalService.created[0].cwd.toString(), createSuggestion().workingDirectory.toString());
        assert.ok(terminalService.created[0].name.includes('Terminal Blueprint: project'));
        assert.strictEqual(tracker.tracked.length, 1);
    });

    test('creates independent terminals for separately approved nested and multi-root projects', async () => {
        const nested = createSuggestion({
            project: createProject({ name: 'web', relativePath: 'apps/web', workingDirectory: vscode.Uri.parse('file:///first/apps/web') })
        });
        const otherRoot = createSuggestion({
            id: 'suggestion:second:build',
            command: 'npm run build',
            project: createProject({ name: 'api', relativePath: 'services/api', workingDirectory: vscode.Uri.parse('file:///second/services/api') })
        });
        const terminalService = createTerminalService();
        const tracker = createTerminalTracker();

        assert.strictEqual(await selectAndRunSuggestedCommand([nested], () => true, createUi({ approved: true }), availableDirectory, terminalService, tracker), 'executed');
        assert.strictEqual(await selectAndRunSuggestedCommand([otherRoot], () => true, createUi({ approved: true }), availableDirectory, terminalService, tracker), 'executed');

        assert.strictEqual(terminalService.created.length, 2);
        assert.deepStrictEqual(terminalService.created.map((terminal) => terminal.sentCommands), [['npm run dev'], ['npm run build']]);
        assert.deepStrictEqual(terminalService.created.map((terminal) => terminal.cwd.toString()), [nested.workingDirectory.toString(), otherRoot.workingDirectory.toString()]);
        assert.notStrictEqual(terminalService.created[0].name, terminalService.created[1].name);
        assert.strictEqual(tracker.tracked.length, 2);
    });

    test('cancelling selection or approval leaves the command unapproved', async () => {
        const selectionCancelled = createUi({ select: undefined });
        const approvalCancelled = createUi({ approved: false });

        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => true, selectionCancelled, availableDirectory, createTerminalService(), createTerminalTracker()),
            'cancelled'
        );
        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => true, approvalCancelled, availableDirectory, createTerminalService(), createTerminalTracker()),
            'cancelled'
        );
        assert.strictEqual(selectionCancelled.preview, undefined);
        assert.ok(approvalCancelled.preview);
        assert.deepStrictEqual(approvalCancelled.information, []);
    });

    test('handles no safe suggestions and untrusted workspaces without offering selection', async () => {
        const noSuggestions = createUi();
        const untrusted = createUi();

        assert.strictEqual(
            await selectAndRunSuggestedCommand([], () => true, noSuggestions, availableDirectory, createTerminalService(), createTerminalTracker()),
            'no-suggestions'
        );
        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => false, untrusted, availableDirectory, createTerminalService(), createTerminalTracker()),
            'untrusted-workspace'
        );
        assert.deepStrictEqual(noSuggestions.information, ['Terminal Blueprint: No safe command suggestions are available in this workspace.']);
        assert.strictEqual(untrusted.pickCount, 0);
        assert.strictEqual(untrusted.preview, undefined);
    });

    test('keeps nested and multi-root projects independent and rejects unavailable folders', async () => {
        const nested = createSuggestion({ project: createProject({ name: 'api', relativePath: 'services/api', workingDirectory: vscode.Uri.parse('file:///first/services/api') }) });
        const otherRoot = createSuggestion({
            id: 'suggestion:other:go:test',
            command: 'go test ./...',
            source: 'Go module',
            reason: 'Verified go.mod module declaration.',
            project: createProject({ name: 'worker', relativePath: 'packages/worker', workingDirectory: vscode.Uri.parse('file:///second/packages/worker') })
        });
        const ui = createUi({ select: otherRoot });
        const unavailable: WorkingDirectoryVerifier = { async isAvailable() { return false; } };

        const items = createSuggestedCommandItems([otherRoot, nested]);
        assert.notStrictEqual(items[0].suggestion.workingDirectory.toString(), items[1].suggestion.workingDirectory.toString());
        assert.strictEqual(await selectAndRunSuggestedCommand([nested, otherRoot], () => true, ui, unavailable, createTerminalService(), createTerminalTracker()), 'unavailable-working-directory');
        assert.strictEqual(ui.preview, undefined);
        assert.strictEqual(ui.warnings.length, 1);
    });

    test('rechecks trust and directory availability after approval before creating a terminal', async () => {
        let trusted = true;
        const trustChangesAfterApproval = createUi({ approved: true, onApproval() { trusted = false; } });
        const terminalService = createTerminalService();

        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => trusted, trustChangesAfterApproval, availableDirectory, terminalService, createTerminalTracker()),
            'untrusted-workspace'
        );
        assert.strictEqual(terminalService.created.length, 0);

        let availabilityChecks = 0;
        const disappearsAfterPreview: WorkingDirectoryVerifier = {
            async isAvailable() {
                availabilityChecks += 1;
                return availabilityChecks === 1;
            }
        };
        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => true, createUi({ approved: true }), disappearsAfterPreview, createTerminalService(), createTerminalTracker()),
            'unavailable-working-directory'
        );
    });

    test('uses an immutable approved command plan and rejects substituted commands', async () => {
        const suggestion = createSuggestion();
        const terminalService = createTerminalService();
        const ui = createUi({ approved: true, onApproval() { suggestion.command = 'npm run dev && unexpected-command'; } });

        assert.strictEqual(await selectAndRunSuggestedCommand([suggestion], () => true, ui, availableDirectory, terminalService, createTerminalTracker()), 'executed');
        assert.deepStrictEqual(terminalService.created[0].sentCommands, ['npm run dev']);
        assert.strictEqual(isSafeSuggestionForExecution({ ...createSuggestion(), command: 'npm run dev; injected-command' }), false);
    });

    test('handles terminal creation failures without executing a command', async () => {
        const ui = createUi({ approved: true });
        const failingTerminalService: TerminalService = {
            createTerminal() {
                throw new Error('terminal unavailable');
            }
        };

        assert.strictEqual(
            await selectAndRunSuggestedCommand([createSuggestion()], () => true, ui, availableDirectory, failingTerminalService, createTerminalTracker()),
            'terminal-creation-failed'
        );
        assert.strictEqual(ui.warnings.length, 1);
    });
});

interface TestUi extends CommandSelectionUi {
    information: string[];
    warnings: string[];
    pickCount: number;
    preview: CommandPreview | undefined;
}

function createUi(options: { select?: CommandSuggestion; approved?: boolean; onApproval?: () => void } = {}): TestUi {
    return {
        information: [],
        warnings: [],
        pickCount: 0,
        preview: undefined,
        async pickSuggestion(items: readonly SuggestedCommandQuickPickItem[]) {
            this.pickCount += 1;
            return options.select === undefined && 'select' in options ? undefined : options.select ?? items[0].suggestion;
        },
        async requestApproval(preview: CommandPreview) {
            this.preview = preview;
            options.onApproval?.();
            return options.approved ?? false;
        },
        showInformation(message: string) {
            this.information.push(message);
        },
        showWarning(message: string) {
            this.warnings.push(message);
        }
    };
}

interface TestTerminal {
    name: string;
    cwd: vscode.Uri;
    sentCommands: string[];
    showCount: number;
}

interface TestTerminalService extends TerminalService {
    created: TestTerminal[];
}

function createTerminalService(): TestTerminalService {
    return {
        created: [],
        createTerminal(options) {
            const terminal: TestTerminal = {
                name: options.name,
                cwd: options.cwd,
                sentCommands: [],
                showCount: 0
            };
            this.created.push(terminal);
            return {
                sendText(text: string) {
                    terminal.sentCommands.push(text);
                },
                show() {
                    terminal.showCount += 1;
                }
            };
        }
    };
}

interface TestTerminalTracker extends TerminalTracker {
    tracked: Array<{ terminal: unknown; name: string; command: string; workingDirectory: vscode.Uri }>;
}

function createTerminalTracker(): TestTerminalTracker {
    let nextTerminalNumber = 1;
    return {
        tracked: [],
        createTerminalName(projectName: string, command: string) {
            const name = `Terminal Blueprint: ${projectName} - ${command} (${nextTerminalNumber})`;
            nextTerminalNumber += 1;
            return name;
        },
        track(terminal, name, command, workingDirectory) {
            this.tracked.push({ terminal, name, command, workingDirectory });
        }
    };
}

const availableDirectory: WorkingDirectoryVerifier = {
    async isAvailable() {
        return true;
    }
};

function createSuggestion(overrides: Partial<CommandSuggestion> = {}): CommandSuggestion {
    const project = overrides.project ?? createProject();
    return {
        id: 'suggestion:project:dev',
        title: 'Run dev',
        description: 'Run the dev package.json script.',
        command: 'npm run dev',
        workingDirectory: project.workingDirectory,
        project,
        source: 'package.json script',
        reason: 'package.json script: next dev',
        ...overrides
    };
}

function createProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
    return {
        name: 'project',
        relativePath: '.',
        workingDirectory: vscode.Uri.parse('file:///workspace/project'),
        technologies: ['Node.js ecosystem'],
        scripts: [],
        composerScripts: [],
        hasDjangoManagePy: false,
        ...overrides
    };
}

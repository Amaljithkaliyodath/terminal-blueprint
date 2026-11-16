import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    CommandPreview,
    CommandSelectionUi,
    createCommandPreview,
    createSuggestedCommandItems,
    selectAndPreviewSuggestedCommand,
    SuggestedCommandQuickPickItem,
    WorkingDirectoryVerifier
} from '../launcher/commandSelectionController';
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

    test('approves only after explicit approval and does not create a terminal', async () => {
        const terminalCount = vscode.window.terminals.length;
        const ui = createUi({ approved: true });
        const result = await selectAndPreviewSuggestedCommand([createSuggestion()], true, ui, availableDirectory);

        assert.strictEqual(result, 'approved');
        assert.strictEqual(ui.preview?.command, 'npm run dev');
        assert.deepStrictEqual(ui.information, ['Command approved. Terminal execution will be available in the next checkpoint.']);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });

    test('cancelling selection or approval leaves the command unapproved', async () => {
        const selectionCancelled = createUi({ select: undefined });
        const approvalCancelled = createUi({ approved: false });

        assert.strictEqual(
            await selectAndPreviewSuggestedCommand([createSuggestion()], true, selectionCancelled, availableDirectory),
            'cancelled'
        );
        assert.strictEqual(
            await selectAndPreviewSuggestedCommand([createSuggestion()], true, approvalCancelled, availableDirectory),
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
            await selectAndPreviewSuggestedCommand([], true, noSuggestions, availableDirectory),
            'no-suggestions'
        );
        assert.strictEqual(
            await selectAndPreviewSuggestedCommand([createSuggestion()], false, untrusted, availableDirectory),
            'untrusted-workspace'
        );
        assert.deepStrictEqual(noSuggestions.information, ['Terminal Blueprint: No safe command suggestions are available in this workspace.']);
        assert.strictEqual(untrusted.pickCount, 0);
        assert.strictEqual(untrusted.preview, undefined);
    });

    test('keeps nested and multi-root projects independent and rejects unavailable folders', async () => {
        const nested = createSuggestion({ project: createProject({ name: 'api', relativePath: 'services/api', workingDirectory: vscode.Uri.parse('file:///first/services/api') }) });
        const otherRoot = createSuggestion({ id: 'suggestion:other:go:test', command: 'go test ./...', project: createProject({ name: 'worker', relativePath: 'packages/worker', workingDirectory: vscode.Uri.parse('file:///second/packages/worker') }) });
        const ui = createUi({ select: otherRoot });
        const unavailable: WorkingDirectoryVerifier = { async isAvailable() { return false; } };

        const items = createSuggestedCommandItems([otherRoot, nested]);
        assert.notStrictEqual(items[0].suggestion.workingDirectory.toString(), items[1].suggestion.workingDirectory.toString());
        assert.strictEqual(await selectAndPreviewSuggestedCommand([nested, otherRoot], true, ui, unavailable), 'unavailable-working-directory');
        assert.strictEqual(ui.preview, undefined);
        assert.strictEqual(ui.warnings.length, 1);
    });
});

interface TestUi extends CommandSelectionUi {
    information: string[];
    warnings: string[];
    pickCount: number;
    preview: CommandPreview | undefined;
}

function createUi(options: { select?: CommandSuggestion; approved?: boolean } = {}): TestUi {
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

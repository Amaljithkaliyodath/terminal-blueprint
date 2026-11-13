import * as assert from 'assert';
import * as vscode from 'vscode';
import { ProjectInfo } from '../scanner/projectScanner';
import { generateCommandSuggestions } from '../suggestions/commandSuggestionEngine';

suite('Command Suggestion Engine', () => {
    test('generates npm script suggestions', () => {
        assertPackageManagerSuggestion('npm', 'npm run dev');
    });

    test('generates pnpm script suggestions', () => {
        assertPackageManagerSuggestion('pnpm', 'pnpm run dev');
    });

    test('generates Yarn script suggestions', () => {
        assertPackageManagerSuggestion('yarn', 'yarn dev');
    });

    test('generates Bun script suggestions', () => {
        assertPackageManagerSuggestion('bun', 'bun run dev');
    });

    test('does not generate suggestions for projects without scripts', () => {
        const result = generateCommandSuggestions([createProject({ scripts: [] })]);

        assert.deepStrictEqual(result, { suggestions: [], warnings: [] });
    });

    test('does not generate commands when package-manager evidence conflicts', () => {
        const project = createProject({
            packageManager: {
                name: 'npm',
                candidates: ['npm', 'pnpm'],
                source: 'packageManager field',
                isAmbiguous: true
            }
        });
        const result = generateCommandSuggestions([project]);

        assert.deepStrictEqual(result.suggestions, []);
        assert.deepStrictEqual(result.warnings.map((warning) => warning.code), [
            'ambiguous-package-manager'
        ]);
    });

    test('safely ignores malformed or incomplete package metadata', () => {
        const result = generateCommandSuggestions([createProject({
            packageManager: undefined,
            scripts: []
        })]);

        assert.deepStrictEqual(result, { suggestions: [], warnings: [] });
    });

    test('uses the nested project working directory', () => {
        const project = createProject({
            name: 'web',
            relativePath: 'apps/web',
            workingDirectory: vscode.Uri.parse('file:///workspace/apps/web')
        });
        const [suggestion] = generateCommandSuggestions([project]).suggestions;

        assert.strictEqual(suggestion.workingDirectory, project.workingDirectory);
        assert.strictEqual(suggestion.project.relativePath, 'apps/web');
    });

    test('keeps suggestions from multiple workspace roots independent', () => {
        const first = createProject({
            name: 'first',
            workingDirectory: vscode.Uri.parse('file:///first-workspace')
        });
        const second = createProject({
            name: 'second',
            workingDirectory: vscode.Uri.parse('file:///second-workspace')
        });
        const suggestions = generateCommandSuggestions([second, first]).suggestions;

        assert.deepStrictEqual(
            suggestions.map((suggestion) => suggestion.project.name),
            ['first', 'second']
        );
        assert.notStrictEqual(suggestions[0].id, suggestions[1].id);
    });

    test('orders suggestions deterministically and removes duplicates', () => {
        const project = createProject({
            scripts: [
                { name: 'test', command: 'node test.js' },
                { name: 'build', command: 'node build.js' },
                { name: 'build', command: 'node build.js' }
            ]
        });
        const first = generateCommandSuggestions([project, project]);
        const second = generateCommandSuggestions([project, project]);

        assert.deepStrictEqual(
            first.suggestions.map((suggestion) => suggestion.command),
            ['npm run build', 'npm run test']
        );
        assert.deepStrictEqual(
            first.suggestions.map((suggestion) => suggestion.id),
            second.suggestions.map((suggestion) => suggestion.id)
        );
    });

    test('does not create terminals while generating suggestions', () => {
        const terminalCount = vscode.window.terminals.length;
        generateCommandSuggestions([createProject()]);

        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

function assertPackageManagerSuggestion(
    packageManagerName: 'npm' | 'pnpm' | 'yarn' | 'bun',
    expectedCommand: string
): void {
    const result = generateCommandSuggestions([createProject({
        packageManager: {
            name: packageManagerName,
            candidates: [packageManagerName],
            source: 'lockfile',
            isAmbiguous: false
        }
    })]);

    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].command, expectedCommand);
    assert.strictEqual(result.suggestions[0].source, 'package.json script');
}

function createProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
    return {
        name: 'project',
        relativePath: '.',
        workingDirectory: vscode.Uri.parse('file:///workspace/project'),
        technologies: ['Node.js ecosystem'],
        packageManager: {
            name: 'npm',
            candidates: ['npm'],
            source: 'lockfile',
            isAmbiguous: false
        },
        scripts: [{ name: 'dev', command: 'node app.js' }],
        ...overrides
    };
}

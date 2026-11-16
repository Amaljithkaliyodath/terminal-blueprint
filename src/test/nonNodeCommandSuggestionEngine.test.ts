import * as assert from 'assert';
import * as vscode from 'vscode';
import { ProjectInfo } from '../scanner/projectScanner';
import { generateCommandSuggestions } from '../suggestions/commandSuggestionEngine';

suite('Non-Node Command Suggestion Engine', () => {
    test('generates commands from verified Composer scripts', () => {
        const result = generateCommandSuggestions([createProject({
            composerScripts: [{ name: 'test', command: 'phpunit' }]
        })]);

        assert.deepStrictEqual(result.suggestions.map((suggestion) => suggestion.command), [
            'composer run test'
        ]);
        assert.strictEqual(result.suggestions[0].source, 'composer script');
    });

    test('generates only standard Maven and Gradle commands', () => {
        const result = generateCommandSuggestions([createProject({
            technologies: ['Maven', 'Gradle']
        })]);

        assert.deepStrictEqual(result.suggestions.map((suggestion) => suggestion.command), [
            'mvn test',
            'mvn package',
            'gradle tasks'
        ]);
    });

    test('generates standard commands for verified Go modules and Cargo manifests', () => {
        const result = generateCommandSuggestions([createProject({
            technologies: ['Go modules', 'Cargo']
        })]);

        assert.deepStrictEqual(result.suggestions.map((suggestion) => suggestion.command), [
            'go test ./...',
            'go build ./...',
            'cargo test',
            'cargo build'
        ]);
    });

    test('suggests Django only when manage.py is verified', () => {
        const django = createProject({
            technologies: ['Python', 'Django'],
            hasDjangoManagePy: true
        });
        const frameworkOnly = createProject({
            workingDirectory: vscode.Uri.parse('file:///workspace/framework-only'),
            technologies: ['Python', 'Django', 'Flask', 'FastAPI'],
            hasDjangoManagePy: false
        });
        const result = generateCommandSuggestions([django, frameworkOnly]);

        assert.deepStrictEqual(result.suggestions.map((suggestion) => suggestion.command), [
            'python manage.py runserver'
        ]);
    });

    test('does not generate non-Node suggestions from missing or malformed metadata', () => {
        const result = generateCommandSuggestions([createProject({
            technologies: [],
            composerScripts: [],
            hasDjangoManagePy: false
        })]);

        assert.deepStrictEqual(result, { suggestions: [], warnings: [] });
    });

    test('rejects unsafe script names from untrusted metadata', () => {
        const result = generateCommandSuggestions([createProject({
            composerScripts: [{ name: 'test; remove', command: 'phpunit' }],
            scripts: [{ name: 'dev; remove', command: 'node app.js' }],
            packageManager: {
                name: 'npm',
                candidates: ['npm'],
                source: 'lockfile',
                isAmbiguous: false
            }
        })]);

        assert.deepStrictEqual(result.suggestions, []);
        assert.deepStrictEqual(result.warnings.map((warning) => warning.code), [
            'unsafe-script-name'
        ]);
    });

    test('keeps nested and multi-root working directories independent', () => {
        const first = createProject({
            name: 'api',
            relativePath: 'services/api',
            workingDirectory: vscode.Uri.parse('file:///first/services/api'),
            technologies: ['Go modules']
        });
        const second = createProject({
            name: 'worker',
            relativePath: 'packages/worker',
            workingDirectory: vscode.Uri.parse('file:///second/packages/worker'),
            technologies: ['Cargo']
        });
        const suggestions = generateCommandSuggestions([second, first]).suggestions;

        assert.strictEqual(suggestions[0].workingDirectory, first.workingDirectory);
        assert.strictEqual(suggestions[2].workingDirectory, second.workingDirectory);
        assert.notStrictEqual(suggestions[0].id, suggestions[2].id);
    });
});

function createProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
    return {
        name: 'project',
        relativePath: '.',
        workingDirectory: vscode.Uri.parse('file:///workspace/project'),
        technologies: [],
        scripts: [],
        composerScripts: [],
        hasDjangoManagePy: false,
        ...overrides
    };
}

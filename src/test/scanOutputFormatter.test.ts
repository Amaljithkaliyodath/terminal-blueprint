import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommandSuggestionResult } from '../models/commandSuggestion';
import { formatScanOutput } from '../output/scanOutputFormatter';
import { ProjectInfo } from '../scanner/projectScanner';
import { generateCommandSuggestions } from '../suggestions/commandSuggestionEngine';

suite('Scan Output Formatter', () => {
    test('displays a suggestion under the correct project with scanner details', () => {
        const project = createProject({
            name: 'web',
            relativePath: 'apps/web',
            workingDirectory: vscode.Uri.parse('file:///workspace/apps/web'),
            technologies: ['Node.js ecosystem', 'Next.js'],
            scripts: [{ name: 'dev', command: 'next dev' }]
        });
        const lines = formatScanOutput(
            [project],
            generateCommandSuggestions([project])
        );

        assert.ok(lines.includes('Project: web (apps/web)'));
        assert.ok(lines.includes('Detected: Node.js ecosystem, Next.js'));
        assert.ok(lines.includes('Available scripts:'));
        assert.ok(lines.includes('  dev: npm run dev (next dev)'));
        assert.ok(lines.includes('Suggested commands:'));
        assert.ok(lines.includes('  Run dev'));
        assert.ok(lines.includes('    Command: npm run dev'));
        assert.ok(lines.includes('    Project: web (apps/web)'));
        assert.ok(lines.includes(
            `    Working directory: ${displayPath(project)}`
        ));
    });

    test('displays npm, pnpm, Yarn, and Bun commands', () => {
        const projects = [
            createProjectForManager('npm'),
            createProjectForManager('pnpm'),
            createProjectForManager('yarn'),
            createProjectForManager('bun')
        ];
        const lines = formatScanOutput(projects, generateCommandSuggestions(projects));

        assert.ok(lines.includes('    Command: npm run dev'));
        assert.ok(lines.includes('    Command: pnpm run dev'));
        assert.ok(lines.includes('    Command: yarn dev'));
        assert.ok(lines.includes('    Command: bun run dev'));
    });

    test('displays conflicting and missing package-manager warnings safely', () => {
        const ambiguous = createProject({
            name: 'ambiguous',
            packageManager: {
                name: 'npm',
                candidates: ['npm', 'pnpm'],
                source: 'packageManager field',
                isAmbiguous: true
            }
        });
        const missing = createProject({
            name: 'missing',
            workingDirectory: vscode.Uri.parse('file:///workspace/missing'),
            packageManager: undefined
        });
        const lines = formatScanOutput(
            [ambiguous, missing],
            generateCommandSuggestions([ambiguous, missing])
        );

        assert.ok(lines.includes('Package-manager warnings:'));
        assert.ok(lines.some((line) => line.includes('package manager is ambiguous')));
        assert.ok(lines.some((line) => line.includes('no verified package manager')));
        assert.strictEqual(lines.filter((line) => line.startsWith('    Command:')).length, 0);
    });

    test('displays a clear message when no safe suggestions are available', () => {
        const project = createProject({ scripts: [] });
        const lines = formatScanOutput([project], emptySuggestionResult());

        assert.ok(lines.includes('No safe command suggestions are available in this workspace.'));
    });

    test('keeps nested and multi-root project paths and directories independent', () => {
        const frontend = createProject({
            name: 'frontend',
            relativePath: 'apps/web',
            workingDirectory: vscode.Uri.parse('file:///first/apps/web')
        });
        const backend = createProject({
            name: 'backend',
            relativePath: 'services/api',
            workingDirectory: vscode.Uri.parse('file:///second/services/api')
        });
        const lines = formatScanOutput(
            [backend, frontend],
            generateCommandSuggestions([backend, frontend])
        );

        const frontendProjectLine = lines.indexOf('Project: frontend (apps/web)');
        const backendProjectLine = lines.indexOf('Project: backend (services/api)');
        const frontendCommandLine = lines.indexOf('    Command: npm run dev');

        assert.ok(frontendProjectLine >= 0);
        assert.ok(backendProjectLine >= 0);
        assert.ok(frontendCommandLine > frontendProjectLine);
        assert.ok(lines.includes(`Working directory: ${displayPath(frontend)}`));
        assert.ok(lines.includes(`Working directory: ${displayPath(backend)}`));
    });

    test('does not create terminals while formatting output', () => {
        const terminalCount = vscode.window.terminals.length;
        formatScanOutput([createProject()], emptySuggestionResult());

        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

function createProjectForManager(
    packageManagerName: 'npm' | 'pnpm' | 'yarn' | 'bun'
): ProjectInfo {
    return createProject({
        name: packageManagerName,
        workingDirectory: vscode.Uri.parse(`file:///${packageManagerName}`),
        packageManager: {
            name: packageManagerName,
            candidates: [packageManagerName],
            source: 'lockfile',
            isAmbiguous: false
        }
    });
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

function emptySuggestionResult(): CommandSuggestionResult {
    return { suggestions: [], warnings: [] };
}

function displayPath(project: ProjectInfo): string {
    return project.workingDirectory.fsPath || project.workingDirectory.toString();
}

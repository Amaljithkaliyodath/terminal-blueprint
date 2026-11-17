import * as assert from 'assert';
import * as vscode from 'vscode';
import { evaluateBlueprintCompatibility, CompatibilityFileSystem } from '../compatibility/blueprintCompatibilityEngine';
import { TERMINAL_BLUEPRINT_SCHEMA_VERSION, TerminalBlueprint } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';

suite('Blueprint Compatibility Engine', () => {
    test('matches technologies, aliases, package managers, and nested directories deterministically', async () => {
        const project = makeProject(['Next.js', 'React', 'TypeScript'], { name: 'pnpm', candidates: ['pnpm'], source: 'lockfile', isAmbiguous: false });
        const result = await evaluateBlueprintCompatibility(makeBlueprint({ technologyHints: ['nextjs', 'React'], packageManagerHint: 'pnpm', directory: 'apps/web' }), project, files(['/workspace/project', '/workspace/project/apps', '/workspace/project/apps/web']));
        assert.strictEqual(result.status, 'COMPATIBLE');
        assert.deepStrictEqual(result.matchedRequirements.map((item) => item.code), ['technology-match', 'technology-match', 'package-manager-match', 'working-directory-available']);
        assert.strictEqual(result.commandWorkingDirectories[0].workingDirectory?.path, '/workspace/project/apps/web');
    });

    test('reports verified technology and package-manager mismatches without substring matching', async () => {
        const project = makeProject(['PHP', 'Composer'], { name: 'npm', candidates: ['npm'], source: 'lockfile', isAmbiguous: false });
        const result = await evaluateBlueprintCompatibility(makeBlueprint({ technologyHints: ['React'], packageManagerHint: 'pnpm' }), project, files(['/workspace/project']));
        assert.strictEqual(result.status, 'INCOMPATIBLE');
        assert.deepStrictEqual(result.mismatches.map((item) => item.code), ['technology-mismatch', 'package-manager-mismatch']);
    });

    test('returns warnings for absent hints, unknown coverage, and ambiguous package-manager evidence', async () => {
        const unknown = await evaluateBlueprintCompatibility(makeBlueprint({ technologyHints: ['Django'], packageManagerHint: 'npm' }), makeProject([], { candidates: ['npm', 'yarn'], source: 'lockfile', isAmbiguous: true }), files(['/workspace/project']));
        assert.strictEqual(unknown.status, 'WARNING');
        assert.deepStrictEqual(unknown.warnings.map((item) => item.code), ['technology-unknown', 'package-manager-ambiguous']);
        const unconstrained = await evaluateBlueprintCompatibility(makeBlueprint({}), makeProject([]), files(['/workspace/project']));
        assert.strictEqual(unconstrained.status, 'COMPATIBLE');
        const invalidHint = await evaluateBlueprintCompatibility(makeBlueprint({ packageManagerHint: 'unsupported' as TerminalBlueprint['packageManagerHint'] }), makeProject([]), files(['/workspace/project']));
        assert.strictEqual(invalidHint.status, 'WARNING');
        assert.strictEqual(invalidHint.warnings[0].code, 'package-manager-unknown');
    });

    test('rejects missing, absolute, traversal, symlink, and inaccessible command directories', async () => {
        const project = makeProject([]);
        for (const [directory, fileSystem, status] of [
            ['missing', files(['/workspace/project']), 'MISSING'],
            ['/absolute', files(['/workspace/project']), 'INVALID'],
            ['../escape', files(['/workspace/project']), 'INVALID'],
            ['linked', files(['/workspace/project', '/workspace/project/linked'], ['/workspace/project/linked']), 'INVALID'],
            ['private', files(['/workspace/project'], [], ['/workspace/project/private']), 'UNVERIFIED']
        ] as const) {
            const result = await evaluateBlueprintCompatibility(makeBlueprint({ directory }), project, fileSystem);
            assert.strictEqual(result.status, status === 'UNVERIFIED' ? 'WARNING' : 'INCOMPATIBLE');
            assert.strictEqual(result.commandWorkingDirectories[0].status, status);
        }
    });

    test('keeps nested and multi-root projects isolated without terminal side effects', async () => {
        const terminalCount = vscode.window.terminals.length;
        const fs = files(['/workspace/one', '/workspace/one/app', '/workspace/two', '/workspace/two/app']);
        const blueprint = makeBlueprint({ directory: 'app' });
        const one = await evaluateBlueprintCompatibility(blueprint, makeProject([], undefined, '/workspace/one'), fs);
        const two = await evaluateBlueprintCompatibility(blueprint, makeProject([], undefined, '/workspace/two'), fs);
        assert.strictEqual(one.commandWorkingDirectories[0].workingDirectory?.path, '/workspace/one/app');
        assert.strictEqual(two.commandWorkingDirectories[0].workingDirectory?.path, '/workspace/two/app');
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

function makeBlueprint(options: { technologyHints?: string[]; packageManagerHint?: TerminalBlueprint['packageManagerHint']; directory?: string } = {}): TerminalBlueprint {
    return { id: 'blueprint', name: 'Blueprint', schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', commands: [{ id: 'command', label: 'Build', command: 'npm run build', ...(options.directory === undefined ? {} : { relativeWorkingDirectory: options.directory }) }], ...(options.technologyHints === undefined ? {} : { technologyHints: options.technologyHints }), ...(options.packageManagerHint === undefined ? {} : { packageManagerHint: options.packageManagerHint }) };
}

function makeProject(technologies: string[], packageManager?: ProjectInfo['packageManager'], path = '/workspace/project'): ProjectInfo {
    return { name: path.split('/').pop() ?? 'project', relativePath: '.', workingDirectory: vscode.Uri.parse(`memfs:${path}`), technologies, ...(packageManager ? { packageManager } : {}), scripts: [], composerScripts: [], hasDjangoManagePy: false };
}

function files(directories: readonly string[], symlinks: readonly string[] = [], failures: readonly string[] = []): CompatibilityFileSystem {
    return { stat: async (uri) => {
        if (failures.includes(uri.path)) { throw new Error('denied'); }
        if (!directories.includes(uri.path)) { throw Object.assign(new Error('missing'), { code: 'FileNotFound' }); }
        return { type: vscode.FileType.Directory | (symlinks.includes(uri.path) ? vscode.FileType.SymbolicLink : 0), ctime: 0, mtime: 0, size: 0 };
    } };
}

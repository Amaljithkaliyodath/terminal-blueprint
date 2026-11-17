import * as assert from 'assert';
import * as vscode from 'vscode';
import { BlueprintCompatibilityUi, inspectBlueprintCompatibility } from '../compatibility/blueprintCompatibilityController';
import { CompatibilityFileSystem } from '../compatibility/blueprintCompatibilityEngine';
import { TERMINAL_BLUEPRINT_SCHEMA_VERSION, TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { formatBlueprintCompatibilityOutput } from '../output/blueprintCompatibilityOutputFormatter';
import { ProjectInfo } from '../scanner/projectScanner';

suite('Blueprint Compatibility Controller', () => {
    test('selects the requested blueprint and project and formats a compatible result', async () => {
        const nested = project('web', 'apps/web', '/workspace/apps/web', ['Next.js']);
        const other = project('api', 'services/api', '/other/services/api', ['PHP']);
        const result = await inspectBlueprintCompatibility(storage([blueprint('one')]), async () => [other, nested], ui('one', nested.workingDirectory.toString()), directories(['/workspace/apps/web']));
        assert.strictEqual(result.outcome, 'displayed');
        if (result.outcome !== 'displayed') { return; }
        assert.strictEqual(result.project.workingDirectory.toString(), nested.workingDirectory.toString());
        assert.strictEqual(result.compatibility.status, 'COMPATIBLE');
        const lines = formatBlueprintCompatibilityOutput(result.blueprint, result.project, result.compatibility);
        assert.ok(lines.includes('Status: COMPATIBLE'));
        assert.ok(lines.includes('Compatibility is informational only. It does not authorize or execute any command.'));
    });

    test('formats warning and incompatible results with command-directory findings', async () => {
        const warning = await inspectBlueprintCompatibility(storage([blueprint('warning')]), async () => [project('unknown', '.', '/workspace/unknown', [])], ui('warning'), directories(['/workspace/unknown']));
        const incompatible = await inspectBlueprintCompatibility(storage([blueprint('bad', 'missing')]), async () => [project('php', '.', '/workspace/php', ['PHP'])], ui('bad'), directories(['/workspace/php']));
        assert.strictEqual(warning.outcome === 'displayed' && warning.compatibility.status, 'WARNING');
        assert.strictEqual(incompatible.outcome === 'displayed' && incompatible.compatibility.status, 'INCOMPATIBLE');
        if (incompatible.outcome === 'displayed') {
            assert.ok(formatBlueprintCompatibilityOutput(incompatible.blueprint, incompatible.project, incompatible.compatibility).some((line) => line.includes('MISSING (missing)')));
        }
    });

    test('handles empty collections, no projects, and picker cancellation without side effects', async () => {
        assert.strictEqual((await inspectBlueprintCompatibility(storage([]), async () => [project('p', '.', '/workspace/p', [])], ui(), directories([]))).outcome, 'no-blueprints');
        assert.strictEqual((await inspectBlueprintCompatibility(storage([blueprint('one')]), async () => [], ui(), directories([]))).outcome, 'no-projects');
        assert.strictEqual((await inspectBlueprintCompatibility(storage([blueprint('one')]), async () => [project('p', '.', '/workspace/p', [])], ui(undefined), directories(['/workspace/p']))).outcome, 'cancelled');
    });

    test('propagates storage and scanner failures without opening terminals or writing files', async () => {
        const terminalCount = vscode.window.terminals.length;
        await assert.rejects(() => inspectBlueprintCompatibility({ async load() { throw new Error('corrupt'); } }, async () => [], ui(), directories([])));
        await assert.rejects(() => inspectBlueprintCompatibility(storage([blueprint('one')]), async () => { throw new Error('scan'); }, ui(), directories([])));
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

function blueprint(id: string, directory?: string): TerminalBlueprint { return { id, name: id, schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', commands: [{ id: `${id}-command`, label: 'Build', command: 'npm run build', ...(directory ? { relativeWorkingDirectory: directory } : {}) }], technologyHints: ['Next.js'] }; }
function storage(blueprints: TerminalBlueprint[]): { load(): Promise<TerminalBlueprintStorageDocument> } { return { async load() { return { schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints }; } }; }
function project(name: string, relativePath: string, path: string, technologies: string[]): ProjectInfo { return { name, relativePath, workingDirectory: vscode.Uri.parse(`memfs:${path}`), technologies, scripts: [], composerScripts: [], hasDjangoManagePy: false }; }
function ui(blueprintId?: string, projectUri?: string): BlueprintCompatibilityUi { return { async pickBlueprint(items) { return blueprintId === undefined ? undefined : items.find((item) => item.blueprint.id === blueprintId)?.blueprint; }, async pickProject(items) { return projectUri === undefined ? undefined : items.find((item) => item.project.workingDirectory.toString() === projectUri)?.project; } }; }
function directories(paths: readonly string[]): CompatibilityFileSystem { return { async stat(uri) { if (!paths.includes(uri.path)) { throw Object.assign(new Error('missing'), { code: 'FileNotFound' }); } return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }; } }; }

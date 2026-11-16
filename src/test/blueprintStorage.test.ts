import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    TERMINAL_BLUEPRINT_SCHEMA_VERSION,
    TerminalBlueprint,
    TerminalBlueprintStorageDocument
} from '../models/terminalBlueprint';
import { BlueprintStorageError, BlueprintStorageService, BlueprintFileSystem } from '../storage/blueprintStorageService';
import { BlueprintValidationError, createEmptyBlueprintStorageDocument, validateBlueprintStorageDocument } from '../storage/blueprintValidation';

suite('Blueprint Storage', () => {
    test('validates and preserves a versioned blueprint document and command order', () => {
        const document = createDocument({
            commands: [
                { id: 'first', label: 'First', command: 'npm run first', relativeWorkingDirectory: 'apps/web' },
                { id: 'second', label: 'Second', command: 'npm run second' }
            ]
        });

        const validated = validateBlueprintStorageDocument(JSON.parse(JSON.stringify(document)));

        assert.deepStrictEqual(validated, document);
        assert.deepStrictEqual(validated.blueprints[0].commands.map((command) => command.id), ['first', 'second']);
        assert.strictEqual(validated.blueprints[0].commands[0].relativeWorkingDirectory, 'apps/web');
    });

    test('returns an empty collection when storage does not exist yet', async () => {
        const service = createService(new MemoryBlueprintFileSystem());

        assert.deepStrictEqual(await service.load(), createEmptyBlueprintStorageDocument());
    });

    test('saves and reloads local UTF-8 JSON without executing commands or creating terminals', async () => {
        const fileSystem = new MemoryBlueprintFileSystem();
        const service = createService(fileSystem);
        const terminalCount = vscode.window.terminals.length;
        const document = createDocument();

        await service.save(document);

        assert.deepStrictEqual(await service.load(), document);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });

    test('rejects unsupported schemas, malformed JSON, and missing required fields', async () => {
        assert.throws(
            () => validateBlueprintStorageDocument({ schemaVersion: 2, blueprints: [] }),
            BlueprintValidationError
        );
        assert.throws(
            () => validateBlueprintStorageDocument({ schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints: [{}] }),
            BlueprintValidationError
        );

        const fileSystem = new MemoryBlueprintFileSystem();
        fileSystem.setFile(storageUri().toString(), '{ broken json');
        await assert.rejects(() => createService(fileSystem).load(), BlueprintStorageError);
    });

    test('rejects duplicate IDs, invalid timestamps, invalid field types, and storage limits', () => {
        const duplicateBlueprints = createDocument();
        duplicateBlueprints.blueprints.push(createBlueprint({ id: duplicateBlueprints.blueprints[0].id }));
        assert.throws(() => validateBlueprintStorageDocument(duplicateBlueprints), BlueprintValidationError);

        const duplicateEntries = createDocument({
            commands: [
                { id: 'same', label: 'One', command: 'npm run one' },
                { id: 'same', label: 'Two', command: 'npm run two' }
            ]
        });
        assert.throws(() => validateBlueprintStorageDocument(duplicateEntries), BlueprintValidationError);

        const invalidTimestamp = createDocument();
        invalidTimestamp.blueprints[0].createdAt = 'not-a-timestamp';
        assert.throws(() => validateBlueprintStorageDocument(invalidTimestamp), BlueprintValidationError);

        const invalidCommand = createDocument();
        invalidCommand.blueprints[0].commands[0].command = '';
        assert.throws(() => validateBlueprintStorageDocument(invalidCommand), BlueprintValidationError);

        const oversizedCommand = createDocument();
        oversizedCommand.blueprints[0].commands[0].command = 'x'.repeat(8001);
        assert.throws(() => validateBlueprintStorageDocument(oversizedCommand), BlueprintValidationError);

        const tooManyBlueprints: TerminalBlueprintStorageDocument = {
            schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
            blueprints: Array.from({ length: 101 }, (_, index) => createBlueprint({ id: `blueprint-${index}` }))
        };
        assert.throws(() => validateBlueprintStorageDocument(tooManyBlueprints), BlueprintValidationError);
    });

    test('rejects absolute and traversing working-directory references', () => {
        for (const relativeWorkingDirectory of ['C:\\project', '/project', '../project', 'apps/../project']) {
            const document = createDocument({
                commands: [{ id: 'entry', label: 'Entry', command: 'npm run dev', relativeWorkingDirectory }]
            });
            assert.throws(() => validateBlueprintStorageDocument(document), BlueprintValidationError);
        }
    });

    test('rejects undeclared fields rather than silently storing secret-like data', () => {
        const document = createDocument() as unknown as Record<string, unknown>;
        document.token = 'not-a-supported-storage-field';

        assert.throws(() => validateBlueprintStorageDocument(document), BlueprintValidationError);
    });

    test('does not overwrite malformed existing data or read/write failures', async () => {
        const malformedFileSystem = new MemoryBlueprintFileSystem();
        malformedFileSystem.setFile(storageUri().toString(), '{ malformed');
        const malformedService = createService(malformedFileSystem);

        await assert.rejects(() => malformedService.save(createDocument()), BlueprintStorageError);
        assert.strictEqual(malformedFileSystem.getText(storageUri().toString()), '{ malformed');

        const failingFileSystem = new MemoryBlueprintFileSystem();
        failingFileSystem.failWrites = true;
        await assert.rejects(() => createService(failingFileSystem).save(createDocument()), BlueprintStorageError);

        const unreadableFileSystem = new MemoryBlueprintFileSystem();
        unreadableFileSystem.failReads = true;
        await assert.rejects(() => createService(unreadableFileSystem).load(), BlueprintStorageError);
    });

    test('serializes concurrent complete-collection saves in request order', async () => {
        const service = createService(new MemoryBlueprintFileSystem());
        const first = createDocument({ name: 'First' });
        const second = createDocument({ name: 'Second' });

        await Promise.all([service.save(first), service.save(second)]);

        assert.strictEqual((await service.load()).blueprints[0].name, 'Second');
    });
});

function createService(fileSystem: MemoryBlueprintFileSystem): BlueprintStorageService {
    return new BlueprintStorageService(vscode.Uri.parse('memfs:/terminal-blueprint'), fileSystem);
}

function storageUri(): vscode.Uri {
    return vscode.Uri.parse('memfs:/terminal-blueprint/terminal-blueprints.json');
}

function createDocument(overrides: Partial<TerminalBlueprint> = {}): TerminalBlueprintStorageDocument {
    return {
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        blueprints: [createBlueprint(overrides)]
    };
}

function createBlueprint(overrides: Partial<TerminalBlueprint> = {}): TerminalBlueprint {
    return {
        id: 'blueprint-one',
        name: 'Development',
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        commands: [{ id: 'dev', label: 'Run development server', command: 'npm run dev' }],
        technologyHints: ['Next.js'],
        packageManagerHint: 'npm',
        ...overrides
    };
}

class MemoryBlueprintFileSystem implements BlueprintFileSystem {
    public failWrites = false;
    public failReads = false;
    private readonly files = new Map<string, Uint8Array>();

    public async createDirectory(): Promise<void> {}

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (this.failReads) {
            throw new Error('read failed');
        }
        const contents = this.files.get(uri.toString());
        if (!contents) {
            throw createFileNotFoundError();
        }
        return contents;
    }

    public async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        if (this.failWrites) {
            throw new Error('write failed');
        }
        this.files.set(uri.toString(), content);
    }

    public async rename(source: vscode.Uri, target: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
        const contents = this.files.get(source.toString());
        if (!contents || (!options.overwrite && this.files.has(target.toString()))) {
            throw new Error('rename failed');
        }
        this.files.set(target.toString(), contents);
        this.files.delete(source.toString());
    }

    public async delete(uri: vscode.Uri): Promise<void> {
        this.files.delete(uri.toString());
    }

    public setFile(uri: string, contents: string): void {
        this.files.set(uri, new TextEncoder().encode(contents));
    }

    public getText(uri: string): string | undefined {
        const contents = this.files.get(uri);
        return contents ? new TextDecoder('utf-8').decode(contents) : undefined;
    }
}

function createFileNotFoundError(): Error & { code: string } {
    const error = new Error('file not found') as Error & { code: string };
    error.code = 'FileNotFound';
    return error;
}

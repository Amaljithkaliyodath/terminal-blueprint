import * as assert from 'assert';
import * as vscode from 'vscode';
import { BlueprintManagementStorage } from '../blueprints/blueprintManagementService';
import { BlueprintTransferError, BlueprintTransferService, BlueprintTransferFileSystem } from '../blueprints/blueprintTransferService';
import { TERMINAL_BLUEPRINT_SCHEMA_VERSION, TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { validateBlueprintStorageDocument } from '../storage/blueprintValidation';

suite('Blueprint Transfer Service', () => {
    test('exports one blueprint and the complete collection as ordered UTF-8 JSON', async () => {
        const storage = new MemoryStorage(documentWith([blueprint('one'), blueprint('two')]));
        const files = new MemoryFiles();
        const service = new BlueprintTransferService(storage, files);
        await service.exportOne(uri('one.json'), 'one');
        await service.exportAll(uri('all.json'));
        assert.deepStrictEqual(parse(files.text(uri('one.json'))), documentWith([blueprint('one')]));
        assert.deepStrictEqual(parse(files.text(uri('all.json'))).blueprints.map((item: TerminalBlueprint) => item.id), ['one', 'two']);
    });

    test('imports valid single blueprints and collections preserving metadata and command order', async () => {
        const storage = new MemoryStorage(); const files = new MemoryFiles(); const service = new BlueprintTransferService(storage, files);
        const single = blueprint('one'); single.commands.push({ id: 'two', label: 'Two', command: 'npm test' });
        files.set(uri('single.json'), JSON.stringify(single));
        files.set(uri('collection.json'), JSON.stringify(documentWith([blueprint('two')])));
        assert.strictEqual(await service.importFile(uri('single.json'), async () => 'skip'), 1);
        assert.strictEqual(await service.importFile(uri('collection.json'), async () => 'skip'), 1);
        assert.deepStrictEqual((await storage.load()).blueprints.map((item) => item.id), ['one', 'two']);
        assert.deepStrictEqual((await storage.load()).blueprints[0].commands.map((item) => item.id), ['one-command', 'two']);
    });

    test('rejects malformed, oversized, unsupported, invalid-path, duplicate-entry, and read failures without mutation', async () => {
        const storage = new MemoryStorage(); const files = new MemoryFiles(); const service = new BlueprintTransferService(storage, files);
        files.set(uri('bad.json'), '{');
        files.set(uri('large.json'), 'x'.repeat(1024 * 1024 + 1));
        files.set(uri('version.json'), JSON.stringify({ schemaVersion: 2, blueprints: [] }));
        const invalid = blueprint('bad'); invalid.commands[0].relativeWorkingDirectory = '../bad'; files.set(uri('path.json'), JSON.stringify(invalid));
        const duplicate = blueprint('duplicate'); duplicate.commands.push({ ...duplicate.commands[0] }); files.set(uri('duplicate.json'), JSON.stringify(duplicate));
        for (const name of ['bad.json', 'large.json', 'version.json', 'path.json', 'duplicate.json']) {
            await assert.rejects(() => service.importFile(uri(name), async () => 'skip'), BlueprintTransferError);
        }
        files.failReads = true; await assert.rejects(() => service.importFile(uri('missing.json'), async () => 'skip'), BlueprintTransferError);
        assert.deepStrictEqual(await storage.load(), documentWith([]));
    });

    test('handles duplicate skip, copy, and cancel without overwriting existing data', async () => {
        const existing = blueprint('one'); const files = new MemoryFiles(); files.set(uri('import.json'), JSON.stringify(existing));
        const storage = new MemoryStorage(documentWith([existing])); let id = 1;
        const service = new BlueprintTransferService(storage, files, () => `new-${id++}`);
        assert.strictEqual(await service.importFile(uri('import.json'), async () => 'skip'), 0);
        assert.strictEqual((await storage.load()).blueprints.length, 1);
        assert.strictEqual(await service.importFile(uri('import.json'), async () => 'copy'), 1);
        const afterCopy = (await storage.load()).blueprints; assert.strictEqual(afterCopy.length, 2); assert.notStrictEqual(afterCopy[0].id, afterCopy[1].id); assert.notStrictEqual(afterCopy[0].commands[0].id, afterCopy[1].commands[0].id);
        assert.strictEqual(await service.importFile(uri('import.json'), async () => 'cancel'), 0);
        assert.strictEqual((await storage.load()).blueprints.length, 2);
    });

    test('handles write failures and concurrent imports without execution side effects', async () => {
        const storage = new MemoryStorage(); const files = new MemoryFiles(); files.failWrites = true;
        const service = new BlueprintTransferService(storage, files); await assert.rejects(() => service.exportAll(uri('out.json')), BlueprintTransferError);
        files.failWrites = false; files.set(uri('a.json'), JSON.stringify(blueprint('a'))); files.set(uri('b.json'), JSON.stringify(blueprint('b')));
        const terminalCount = vscode.window.terminals.length;
        await Promise.all([service.importFile(uri('a.json'), async () => 'skip'), service.importFile(uri('b.json'), async () => 'skip')]);
        assert.deepStrictEqual((await storage.load()).blueprints.map((item) => item.id), ['a', 'b']); assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });

    test('asks for a decision when a concurrent import creates a duplicate before its queued update', async () => {
        const terminalCount = vscode.window.terminals.length;

        const skipped = await importAfterConcurrentCollision('skip');
        assert.strictEqual(skipped.firstResult, 1); assert.strictEqual(skipped.secondResult, 0); assert.strictEqual(skipped.decisions, 1);
        assert.deepStrictEqual(skipped.blueprints.map((item) => item.id), ['same']);

        const copied = await importAfterConcurrentCollision('copy');
        assert.strictEqual(copied.firstResult, 1); assert.strictEqual(copied.secondResult, 1); assert.strictEqual(copied.decisions, 1);
        assert.strictEqual(copied.blueprints.length, 2); assert.notStrictEqual(copied.blueprints[0].id, copied.blueprints[1].id);
        assert.notStrictEqual(copied.blueprints[0].commands[0].id, copied.blueprints[1].commands[0].id);

        const cancelled = await importAfterConcurrentCollision('cancel');
        assert.strictEqual(cancelled.firstResult, 1); assert.strictEqual(cancelled.secondResult, 0); assert.strictEqual(cancelled.decisions, 1);
        assert.deepStrictEqual(cancelled.blueprints.map((item) => item.id), ['same']);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });
});

async function importAfterConcurrentCollision(decision: 'skip' | 'copy' | 'cancel'): Promise<{ firstResult: number; secondResult: number; decisions: number; blueprints: TerminalBlueprint[] }> {
    const storage = new CoordinatedMemoryStorage(); const files = new MemoryFiles(); files.set(uri('same.json'), JSON.stringify(blueprint('same')));
    let id = 1; let decisions = 0;
    const service = new BlueprintTransferService(storage, files, () => `new-${id++}`);
    const first = service.importFile(uri('same.json'), async () => 'skip');
    await storage.waitForFirstUpdate();
    const second = service.importFile(uri('same.json'), async () => { decisions += 1; return decision; });
    await storage.waitForSecondUpdate();
    storage.releaseFirstUpdate();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    return { firstResult, secondResult, decisions, blueprints: (await storage.load()).blueprints };
}

function blueprint(id: string): TerminalBlueprint { return { id, name: id, schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', commands: [{ id: `${id}-command`, label: 'Dev', command: 'npm run dev' }], technologyHints: ['Next.js'], packageManagerHint: 'npm' }; }
function documentWith(blueprints: TerminalBlueprint[]): TerminalBlueprintStorageDocument { return { schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints }; }
function uri(name: string): vscode.Uri { return vscode.Uri.parse(`memfs:/transfer/${name}`); }
function parse(value: string | undefined): TerminalBlueprintStorageDocument { return JSON.parse(value ?? ''); }

class MemoryFiles implements BlueprintTransferFileSystem {
    public failReads = false; public failWrites = false; private readonly data = new Map<string, Uint8Array>();
    async readFile(value: vscode.Uri): Promise<Uint8Array> { if (this.failReads) { throw new Error('read'); } const result = this.data.get(value.toString()); if (!result) { throw new Error('missing'); } return result; }
    async writeFile(value: vscode.Uri, contents: Uint8Array): Promise<void> { if (this.failWrites) { throw new Error('write'); } this.data.set(value.toString(), contents); }
    set(value: vscode.Uri, text: string): void { this.data.set(value.toString(), new TextEncoder().encode(text)); }
    text(value: vscode.Uri): string | undefined { const result = this.data.get(value.toString()); return result ? new TextDecoder().decode(result) : undefined; }
}
class MemoryStorage implements BlueprintManagementStorage {
    protected document: TerminalBlueprintStorageDocument; protected queue: Promise<void> = Promise.resolve();
    constructor(document: TerminalBlueprintStorageDocument = documentWith([])) { this.document = document; }
    async load(): Promise<TerminalBlueprintStorageDocument> { return validateBlueprintStorageDocument(this.document); }
    update(updater: (document: TerminalBlueprintStorageDocument) => TerminalBlueprintStorageDocument): Promise<TerminalBlueprintStorageDocument> { const operation = this.queue.then(() => this.document = validateBlueprintStorageDocument(updater(this.document))); this.queue = operation.then(() => undefined, () => undefined); return operation; }
}

class CoordinatedMemoryStorage extends MemoryStorage {
    private firstUpdate = true;
    private readonly firstUpdateStarted = createDeferred();
    private readonly secondUpdateQueued = createDeferred();
    private readonly releaseFirstUpdateSignal = createDeferred();

    public waitForFirstUpdate(): Promise<void> { return this.firstUpdateStarted.promise; }
    public waitForSecondUpdate(): Promise<void> { return this.secondUpdateQueued.promise; }
    public releaseFirstUpdate(): void { this.releaseFirstUpdateSignal.resolve(); }

    public update(updater: (document: TerminalBlueprintStorageDocument) => TerminalBlueprintStorageDocument): Promise<TerminalBlueprintStorageDocument> {
        const waitForRelease = this.firstUpdate; this.firstUpdate = false;
        if (!waitForRelease) { this.secondUpdateQueued.resolve(); }
        const operation = this.queue.then(async () => {
            if (waitForRelease) { this.firstUpdateStarted.resolve(); await this.releaseFirstUpdateSignal.promise; }
            this.document = validateBlueprintStorageDocument(updater(this.document));
            return this.document;
        });
        this.queue = operation.then(() => undefined, () => undefined);
        return operation;
    }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    return { promise: new Promise<void>((complete) => { resolve = complete; }), resolve };
}

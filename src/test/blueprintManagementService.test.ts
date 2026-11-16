import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    TERMINAL_BLUEPRINT_SCHEMA_VERSION,
    TerminalBlueprint,
    TerminalBlueprintStorageDocument
} from '../models/terminalBlueprint';
import {
    BlueprintCommandDraft,
    BlueprintManagementService,
    BlueprintManagementStorage
} from '../blueprints/blueprintManagementService';
import { validateBlueprintStorageDocument } from '../storage/blueprintValidation';

suite('Blueprint Management Service', () => {
    test('creates and lists blueprints with stable generated IDs', async () => {
        const storage = new MemoryManagementStorage();
        const service = createService(storage);

        const created = await service.create({ name: 'Development', commands: [command('Dev', 'npm run dev')] });

        assert.strictEqual((await service.list()).length, 1);
        assert.ok(created.id.startsWith('blueprint-'));
        assert.ok(created.commands[0].id.startsWith('command-'));
        assert.strictEqual(created.createdAt, created.updatedAt);
    });

    test('edits metadata and command entries while preserving creation time and order', async () => {
        const service = createService(new MemoryManagementStorage());
        const created = await service.create({
            name: 'Development',
            commands: [command('First', 'npm run first'), command('Second', 'npm run second')]
        });
        const renamed = await service.editMetadata(created.id, { name: 'Renamed', description: 'Updated description' });
        const edited = await service.editCommand(renamed.id, renamed.commands[0].id, command('Edited', 'npm run edited', 'apps/web'));
        const reordered = await service.moveCommand(edited.id, edited.commands[1].id, 'up');

        assert.strictEqual(renamed.createdAt, created.createdAt);
        assert.notStrictEqual(renamed.updatedAt, created.updatedAt);
        assert.strictEqual(edited.commands[0].label, 'Edited');
        assert.strictEqual(edited.commands[0].relativeWorkingDirectory, 'apps/web');
        assert.deepStrictEqual(reordered.commands.map((entry) => entry.label), ['Second', 'Edited']);
    });

    test('adds, removes, and rejects removing the final command through validation', async () => {
        const service = createService(new MemoryManagementStorage());
        const created = await service.create({ name: 'Development', commands: [command('One', 'npm run one')] });
        const withSecond = await service.addCommand(created.id, command('Two', 'npm run two'));
        const withoutFirst = await service.removeCommand(withSecond.id, withSecond.commands[0].id);

        assert.deepStrictEqual(withoutFirst.commands.map((entry) => entry.label), ['Two']);
        await assert.rejects(() => service.removeCommand(withoutFirst.id, withoutFirst.commands[0].id));
    });

    test('duplicates blueprints with new blueprint and command-entry IDs', async () => {
        const service = createService(new MemoryManagementStorage());
        const source = await service.create({ name: 'Development', commands: [command('Dev', 'npm run dev'), command('Test', 'npm test')] });
        const duplicate = await service.duplicate(source.id);

        assert.notStrictEqual(duplicate.id, source.id);
        assert.strictEqual(duplicate.name, 'Development Copy');
        assert.deepStrictEqual(duplicate.commands.map((entry) => entry.command), source.commands.map((entry) => entry.command));
        assert.ok(duplicate.commands.every((entry, index) => entry.id !== source.commands[index].id));
    });

    test('deletes only the selected blueprint and leaves no terminal side effects', async () => {
        const service = createService(new MemoryManagementStorage());
        const terminalCount = vscode.window.terminals.length;
        const first = await service.create({ name: 'First', commands: [command('Dev', 'npm run dev')] });
        const second = await service.create({ name: 'Second', commands: [command('Test', 'npm test')] });

        await service.delete(first.id);

        assert.deepStrictEqual((await service.list()).map((blueprint) => blueprint.id), [second.id]);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });

    test('rejects invalid draft data and storage failures without changing the collection', async () => {
        const storage = new MemoryManagementStorage();
        const service = createService(storage);
        const created = await service.create({ name: 'Valid', commands: [command('Dev', 'npm run dev')] });

        await assert.rejects(() => service.editMetadata(created.id, { name: '', description: 'Invalid' }));
        assert.strictEqual((await service.list())[0].name, 'Valid');

        storage.failUpdates = true;
        await assert.rejects(() => service.create({ name: 'Blocked', commands: [command('Dev', 'npm run dev')] }));
        assert.strictEqual((await service.list()).length, 1);
    });

    test('serializes concurrent management updates without lost blueprints', async () => {
        const service = createService(new MemoryManagementStorage());

        await Promise.all([
            service.create({ name: 'First', commands: [command('One', 'npm run one')] }),
            service.create({ name: 'Second', commands: [command('Two', 'npm run two')] })
        ]);

        assert.deepStrictEqual((await service.list()).map((blueprint) => blueprint.name), ['First', 'Second']);
    });
});

function command(label: string, commandText: string, relativeWorkingDirectory?: string): BlueprintCommandDraft {
    return { label, command: commandText, ...(relativeWorkingDirectory === undefined ? {} : { relativeWorkingDirectory }) };
}

function createService(storage: MemoryManagementStorage): BlueprintManagementService {
    let id = 1;
    let clock = 0;
    return new BlueprintManagementService(
        storage,
        () => new Date(`2026-01-01T00:00:0${clock++}.000Z`),
        () => `id-${id++}`
    );
}

class MemoryManagementStorage implements BlueprintManagementStorage {
    public failUpdates = false;
    private document: TerminalBlueprintStorageDocument = {
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        blueprints: []
    };
    private queue: Promise<void> = Promise.resolve();

    public async load(): Promise<TerminalBlueprintStorageDocument> {
        return validateBlueprintStorageDocument(this.document);
    }

    public update(updater: (document: TerminalBlueprintStorageDocument) => TerminalBlueprintStorageDocument): Promise<TerminalBlueprintStorageDocument> {
        const operation = this.queue.then(() => {
            if (this.failUpdates) {
                throw new Error('storage failed');
            }
            this.document = validateBlueprintStorageDocument(updater(validateBlueprintStorageDocument(this.document)));
            return this.document;
        });
        this.queue = operation.then(() => undefined, () => undefined);
        return operation;
    }
}

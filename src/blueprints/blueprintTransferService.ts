import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { TERMINAL_BLUEPRINT_SCHEMA_VERSION, TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { BlueprintManagementStorage } from './blueprintManagementService';
import { validateBlueprintStorageDocument } from '../storage/blueprintValidation';

const maxImportBytes = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export type DuplicateBlueprintDecision = 'skip' | 'copy' | 'cancel';
export interface BlueprintTransferFileSystem {
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
    writeFile(uri: vscode.Uri, contents: Uint8Array): Thenable<void>;
}
export class BlueprintTransferError extends Error {
    public constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'BlueprintTransferError';
    }
}

export class BlueprintTransferService {
    public constructor(
        private readonly storage: BlueprintManagementStorage,
        private readonly fileSystem: BlueprintTransferFileSystem = vscode.workspace.fs,
        private readonly createId: () => string = randomUUID
    ) {}

    public async exportAll(uri: vscode.Uri): Promise<void> {
        await this.write(uri, await this.storage.load());
    }

    public async exportOne(uri: vscode.Uri, blueprintId: string): Promise<void> {
        const document = await this.storage.load();
        const blueprint = document.blueprints.find((candidate) => candidate.id === blueprintId);
        if (!blueprint) { throw new BlueprintTransferError(`Blueprint "${blueprintId}" was not found.`); }
        await this.write(uri, { schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints: [blueprint] });
    }

    public async importFile(uri: vscode.Uri, decideDuplicate: (blueprint: TerminalBlueprint) => Promise<DuplicateBlueprintDecision>): Promise<number> {
        let bytes: Uint8Array;
        try { bytes = await this.fileSystem.readFile(uri); } catch (error) { throw new BlueprintTransferError('Unable to read the selected blueprint file.', error); }
        if (bytes.byteLength > maxImportBytes) { throw new BlueprintTransferError(`Import file exceeds the ${maxImportBytes}-byte limit.`); }
        let incoming: TerminalBlueprintStorageDocument;
        try {
            const parsed: unknown = JSON.parse(decoder.decode(bytes));
            incoming = validateBlueprintStorageDocument(isSingleBlueprint(parsed) ? { schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION, blueprints: [parsed] } : parsed);
        } catch (error) { throw new BlueprintTransferError('Selected blueprint file is malformed or unsupported.', error); }
        const existingIds = new Set((await this.storage.load()).blueprints.map((blueprint) => blueprint.id));
        const decisions = new Map<string, DuplicateBlueprintDecision>();
        for (const blueprint of incoming.blueprints) {
            if (existingIds.has(blueprint.id)) {
                const decision = await decideDuplicate(blueprint);
                if (decision === 'cancel') { return 0; }
                decisions.set(blueprint.id, decision);
            }
        }
        let imported = 0;
        await this.storage.update((current) => {
            const blueprints = [...current.blueprints];
            for (const blueprint of incoming.blueprints) {
                if (blueprints.some((candidate) => candidate.id === blueprint.id)) {
                    if (decisions.get(blueprint.id) === 'copy') { blueprints.push(copyBlueprint(blueprint, blueprints, this.createId)); imported += 1; }
                    continue;
                }
                blueprints.push(blueprint); imported += 1;
            }
            return { ...current, blueprints };
        });
        return imported;
    }

    private async write(uri: vscode.Uri, document: TerminalBlueprintStorageDocument): Promise<void> {
        const valid = validateBlueprintStorageDocument(document);
        try { await this.fileSystem.writeFile(uri, encoder.encode(JSON.stringify(valid, undefined, 2))); }
        catch (error) { throw new BlueprintTransferError('Unable to write the selected export file.', error); }
    }
}

function isSingleBlueprint(value: unknown): value is TerminalBlueprint {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && 'commands' in value && 'schemaVersion' in value && !('blueprints' in value);
}

function copyBlueprint(source: TerminalBlueprint, existing: readonly TerminalBlueprint[], createId: () => string): TerminalBlueprint {
    const used = new Set(existing.map((blueprint) => blueprint.id));
    const id = unique('blueprint', used, createId);
    const commandIds = new Set<string>();
    return { ...source, id, name: `${source.name} Copy`, commands: source.commands.map((command) => ({ ...command, id: unique('command', commandIds, createId) })) };
}

function unique(prefix: string, used: Set<string>, createId: () => string): string {
    for (let attempt = 0; attempt < 10; attempt += 1) { const id = `${prefix}-${createId()}`; if (!used.has(id)) { used.add(id); return id; } }
    throw new BlueprintTransferError(`Unable to generate a unique ${prefix} ID.`);
}

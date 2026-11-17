import { randomUUID } from 'crypto';
import {
    TERMINAL_BLUEPRINT_SCHEMA_VERSION,
    TerminalBlueprint,
    TerminalBlueprintCommand,
    TerminalBlueprintStorageDocument
} from '../models/terminalBlueprint';

export interface BlueprintManagementStorage {
    load(): Promise<TerminalBlueprintStorageDocument>;
    update(updater: (document: TerminalBlueprintStorageDocument) => TerminalBlueprintStorageDocument): Promise<TerminalBlueprintStorageDocument>;
}

export interface BlueprintCommandDraft {
    label: string;
    command: string;
    description?: string;
    relativeWorkingDirectory?: string;
}

export interface BlueprintDraft {
    name: string;
    description?: string;
    commands: BlueprintCommandDraft[];
}

export interface BlueprintMetadataDraft {
    name: string;
    description?: string;
}

export class BlueprintNotFoundError extends Error {
    public constructor(id: string) {
        super(`Blueprint "${id}" was not found.`);
        this.name = 'BlueprintNotFoundError';
    }
}

export class BlueprintManagementService {
    public constructor(
        private readonly storage: BlueprintManagementStorage,
        private readonly now: () => Date = () => new Date(),
        private readonly createId: () => string = randomUUID
    ) {}

    public async list(): Promise<readonly TerminalBlueprint[]> {
        return (await this.storage.load()).blueprints;
    }

    public async get(id: string): Promise<TerminalBlueprint> {
        const blueprint = (await this.storage.load()).blueprints.find((candidate) => candidate.id === id);
        if (!blueprint) {
            throw new BlueprintNotFoundError(id);
        }
        return blueprint;
    }

    public async create(draft: BlueprintDraft): Promise<TerminalBlueprint> {
        let created!: TerminalBlueprint;
        await this.storage.update((document) => {
            const timestamp = this.timestamp();
            created = {
                id: this.uniqueId('blueprint', document.blueprints.map((blueprint) => blueprint.id)),
                name: draft.name,
                ...(draft.description === undefined ? {} : { description: draft.description }),
                schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
                createdAt: timestamp,
                updatedAt: timestamp,
                commands: draft.commands.map((command) => this.createCommand(command, []))
            };
            return { ...document, blueprints: [...document.blueprints, created] };
        });
        return created;
    }

    public async editMetadata(id: string, draft: BlueprintMetadataDraft): Promise<TerminalBlueprint> {
        return this.updateBlueprint(id, (blueprint) => ({
            ...blueprint,
            name: draft.name,
            ...(draft.description === undefined ? { description: undefined } : { description: draft.description })
        }));
    }

    public async addCommand(id: string, draft: BlueprintCommandDraft): Promise<TerminalBlueprint> {
        return this.updateBlueprint(id, (blueprint) => ({
            ...blueprint,
            commands: [...blueprint.commands, this.createCommand(draft, blueprint.commands.map((command) => command.id))]
        }));
    }

    public async editCommand(id: string, commandId: string, draft: BlueprintCommandDraft): Promise<TerminalBlueprint> {
        return this.updateBlueprint(id, (blueprint) => ({
            ...blueprint,
            commands: blueprint.commands.map((command) => command.id === commandId ? {
                ...command,
                label: draft.label,
                command: draft.command,
                ...(draft.description === undefined ? { description: undefined } : { description: draft.description }),
                ...(draft.relativeWorkingDirectory === undefined ? { relativeWorkingDirectory: undefined } : { relativeWorkingDirectory: draft.relativeWorkingDirectory })
            } : command)
        }));
    }

    public async removeCommand(id: string, commandId: string): Promise<TerminalBlueprint> {
        return this.updateBlueprint(id, (blueprint) => ({
            ...blueprint,
            commands: blueprint.commands.filter((command) => command.id !== commandId)
        }));
    }

    public async moveCommand(id: string, commandId: string, direction: 'up' | 'down'): Promise<TerminalBlueprint> {
        return this.updateBlueprint(id, (blueprint) => {
            const index = blueprint.commands.findIndex((command) => command.id === commandId);
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (index < 0 || targetIndex < 0 || targetIndex >= blueprint.commands.length) {
                return blueprint;
            }
            const commands = [...blueprint.commands];
            [commands[index], commands[targetIndex]] = [commands[targetIndex], commands[index]];
            return { ...blueprint, commands };
        });
    }

    public async duplicate(id: string): Promise<TerminalBlueprint> {
        let duplicate!: TerminalBlueprint;
        await this.storage.update((document) => {
            const source = this.requireBlueprint(document, id);
            const timestamp = this.timestamp();
            const duplicateCommandIds: string[] = [];
            duplicate = {
                ...source,
                id: this.uniqueId('blueprint', document.blueprints.map((blueprint) => blueprint.id)),
                name: `${source.name} Copy`,
                createdAt: timestamp,
                updatedAt: timestamp,
                commands: source.commands.map((command) => ({
                    ...command,
                    id: this.createDuplicateCommandId(source.commands, duplicateCommandIds)
                }))
            };
            return { ...document, blueprints: [...document.blueprints, duplicate] };
        });
        return duplicate;
    }

    public async delete(id: string): Promise<void> {
        await this.storage.update((document) => {
            this.requireBlueprint(document, id);
            return { ...document, blueprints: document.blueprints.filter((blueprint) => blueprint.id !== id) };
        });
    }

    private async updateBlueprint(
        id: string,
        updater: (blueprint: TerminalBlueprint) => TerminalBlueprint
    ): Promise<TerminalBlueprint> {
        let updated!: TerminalBlueprint;
        await this.storage.update((document) => {
            const original = this.requireBlueprint(document, id);
            updated = {
                ...updater(original),
                createdAt: original.createdAt,
                updatedAt: this.timestamp()
            };
            return {
                ...document,
                blueprints: document.blueprints.map((blueprint) => blueprint.id === id ? updated : blueprint)
            };
        });
        return updated;
    }

    private createCommand(draft: BlueprintCommandDraft, existingIds: readonly string[]): TerminalBlueprintCommand {
        return {
            id: this.uniqueId('command', existingIds),
            label: draft.label,
            command: draft.command,
            ...(draft.description === undefined ? {} : { description: draft.description }),
            ...(draft.relativeWorkingDirectory === undefined ? {} : { relativeWorkingDirectory: draft.relativeWorkingDirectory })
        };
    }

    private createDuplicateCommandId(
        sourceCommands: readonly TerminalBlueprintCommand[],
        duplicateCommandIds: string[]
    ): string {
        const id = this.uniqueId(
            'command',
            [...sourceCommands.map((command) => command.id), ...duplicateCommandIds]
        );
        duplicateCommandIds.push(id);
        return id;
    }

    private requireBlueprint(document: TerminalBlueprintStorageDocument, id: string): TerminalBlueprint {
        const blueprint = document.blueprints.find((candidate) => candidate.id === id);
        if (!blueprint) {
            throw new BlueprintNotFoundError(id);
        }
        return blueprint;
    }

    private uniqueId(prefix: string, existingIds: readonly string[]): string {
        const existing = new Set(existingIds);
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = `${prefix}-${this.createId()}`;
            if (!existing.has(id)) {
                return id;
            }
        }
        throw new Error(`Unable to generate a unique ${prefix} ID.`);
    }

    private timestamp(): string {
        return this.now().toISOString();
    }
}

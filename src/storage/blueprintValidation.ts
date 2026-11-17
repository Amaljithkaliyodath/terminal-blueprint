import {
    BlueprintPackageManagerHint,
    TERMINAL_BLUEPRINT_SCHEMA_VERSION,
    TerminalBlueprint,
    TerminalBlueprintCommand,
    TerminalBlueprintStorageDocument
} from '../models/terminalBlueprint';

const MAX_BLUEPRINTS = 100;
const MAX_COMMANDS_PER_BLUEPRINT = 50;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 120;
const MAX_LABEL_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_COMMAND_LENGTH = 8000;
const MAX_RELATIVE_DIRECTORY_LENGTH = 500;
const MAX_TECHNOLOGY_HINTS = 20;
const MAX_TECHNOLOGY_HINT_LENGTH = 120;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const packageManagerHints = new Set<BlueprintPackageManagerHint>([
    'npm', 'pnpm', 'yarn', 'bun', 'composer', 'maven', 'gradle', 'go', 'cargo', 'python'
]);

export class BlueprintValidationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'BlueprintValidationError';
    }
}

export function createEmptyBlueprintStorageDocument(): TerminalBlueprintStorageDocument {
    return {
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        blueprints: []
    };
}

export function validateBlueprintStorageDocument(value: unknown): TerminalBlueprintStorageDocument {
    const document = requireRecord(value, 'Blueprint storage document must be a JSON object.');
    rejectUnexpectedProperties(document, ['schemaVersion', 'blueprints'], 'Blueprint storage document');
    requireExactSchemaVersion(document.schemaVersion, 'Blueprint storage document');
    const rawBlueprints = requireArray(document.blueprints, 'Blueprint storage document must include a blueprints array.');

    if (rawBlueprints.length > MAX_BLUEPRINTS) {
        throw new BlueprintValidationError(`Blueprint storage supports at most ${MAX_BLUEPRINTS} blueprints.`);
    }

    const blueprintIds = new Set<string>();
    const blueprints = rawBlueprints.map((blueprint, index) => {
        const validated = validateBlueprint(blueprint, `blueprints[${index}]`);
        if (blueprintIds.has(validated.id)) {
            throw new BlueprintValidationError(`Duplicate blueprint ID "${validated.id}" is not allowed.`);
        }
        blueprintIds.add(validated.id);
        return validated;
    });
    const validatedDocument = {
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        blueprints
    } satisfies TerminalBlueprintStorageDocument;

    if (new TextEncoder().encode(JSON.stringify(validatedDocument)).byteLength > MAX_DOCUMENT_BYTES) {
        throw new BlueprintValidationError(`Blueprint storage exceeds the ${MAX_DOCUMENT_BYTES}-byte limit.`);
    }

    return validatedDocument;
}

function validateBlueprint(value: unknown, location: string): TerminalBlueprint {
    const blueprint = requireRecord(value, `${location} must be an object.`);
    rejectUnexpectedProperties(blueprint, [
        'id', 'name', 'description', 'schemaVersion', 'createdAt', 'updatedAt',
        'commands', 'technologyHints', 'packageManagerHint'
    ], location);
    const id = validateIdentifier(blueprint.id, `${location}.id`);
    const name = validateText(blueprint.name, `${location}.name`, MAX_NAME_LENGTH);
    requireExactSchemaVersion(blueprint.schemaVersion, location);
    const createdAt = validateTimestamp(blueprint.createdAt, `${location}.createdAt`);
    const updatedAt = validateTimestamp(blueprint.updatedAt, `${location}.updatedAt`);
    const rawCommands = requireArray(blueprint.commands, `${location}.commands must be an array.`);

    if (rawCommands.length === 0) {
        throw new BlueprintValidationError(`${location}.commands must include at least one command.`);
    }
    if (rawCommands.length > MAX_COMMANDS_PER_BLUEPRINT) {
        throw new BlueprintValidationError(`${location}.commands supports at most ${MAX_COMMANDS_PER_BLUEPRINT} entries.`);
    }

    const commandIds = new Set<string>();
    const commands = rawCommands.map((command, index) => {
        const validated = validateCommand(command, `${location}.commands[${index}]`);
        if (commandIds.has(validated.id)) {
            throw new BlueprintValidationError(`Duplicate command-entry ID "${validated.id}" in blueprint "${id}" is not allowed.`);
        }
        commandIds.add(validated.id);
        return validated;
    });

    const description = validateOptionalText(blueprint.description, `${location}.description`, MAX_DESCRIPTION_LENGTH);
    const technologyHints = validateTechnologyHints(blueprint.technologyHints, `${location}.technologyHints`);
    const packageManagerHint = validatePackageManagerHint(blueprint.packageManagerHint, `${location}.packageManagerHint`);

    return {
        id,
        name,
        schemaVersion: TERMINAL_BLUEPRINT_SCHEMA_VERSION,
        createdAt,
        updatedAt,
        commands,
        ...(description === undefined ? {} : { description }),
        ...(technologyHints === undefined ? {} : { technologyHints }),
        ...(packageManagerHint === undefined ? {} : { packageManagerHint })
    };
}

function validateCommand(value: unknown, location: string): TerminalBlueprintCommand {
    const command = requireRecord(value, `${location} must be an object.`);
    rejectUnexpectedProperties(command, [
        'id', 'label', 'command', 'description', 'relativeWorkingDirectory'
    ], location);
    const id = validateIdentifier(command.id, `${location}.id`);
    const label = validateText(command.label, `${location}.label`, MAX_LABEL_LENGTH);
    const commandText = validateText(command.command, `${location}.command`, MAX_COMMAND_LENGTH);
    const description = validateOptionalText(command.description, `${location}.description`, MAX_DESCRIPTION_LENGTH);
    const relativeWorkingDirectory = validateRelativeWorkingDirectory(
        command.relativeWorkingDirectory,
        `${location}.relativeWorkingDirectory`
    );

    return {
        id,
        label,
        command: commandText,
        ...(description === undefined ? {} : { description }),
        ...(relativeWorkingDirectory === undefined ? {} : { relativeWorkingDirectory })
    };
}

function requireExactSchemaVersion(value: unknown, location: string): void {
    if (value !== TERMINAL_BLUEPRINT_SCHEMA_VERSION) {
        throw new BlueprintValidationError(`${location} uses unsupported schema version "${String(value)}". Supported version: ${TERMINAL_BLUEPRINT_SCHEMA_VERSION}.`);
    }
}

function validateIdentifier(value: unknown, location: string): string {
    const identifier = validateText(value, location, MAX_ID_LENGTH);
    if (!identifierPattern.test(identifier)) {
        throw new BlueprintValidationError(`${location} must contain only letters, numbers, dots, underscores, or hyphens.`);
    }
    return identifier;
}

function validateTimestamp(value: unknown, location: string): string {
    if (typeof value !== 'string' || !isCanonicalIsoTimestamp(value)) {
        throw new BlueprintValidationError(`${location} must be a canonical ISO-8601 UTC timestamp.`);
    }
    return value;
}

function isCanonicalIsoTimestamp(value: string): boolean {
    try {
        return new Date(value).toISOString() === value;
    } catch {
        return false;
    }
}

function validateRelativeWorkingDirectory(value: unknown, location: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const directory = validateText(value, location, MAX_RELATIVE_DIRECTORY_LENGTH);
    if (directory.startsWith('/') || directory.startsWith('\\') || /^[A-Za-z]:/.test(directory) || directory.split(/[\\/]+/).includes('..')) {
        throw new BlueprintValidationError(`${location} must be a relative directory without parent traversal.`);
    }
    return directory;
}

function validateTechnologyHints(value: unknown, location: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const hints = requireArray(value, `${location} must be an array.`);
    if (hints.length > MAX_TECHNOLOGY_HINTS) {
        throw new BlueprintValidationError(`${location} supports at most ${MAX_TECHNOLOGY_HINTS} hints.`);
    }
    return hints.map((hint, index) => validateText(hint, `${location}[${index}]`, MAX_TECHNOLOGY_HINT_LENGTH));
}

function validatePackageManagerHint(value: unknown, location: string): BlueprintPackageManagerHint | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string' || !packageManagerHints.has(value as BlueprintPackageManagerHint)) {
        throw new BlueprintValidationError(`${location} must be a supported package-manager hint.`);
    }
    return value as BlueprintPackageManagerHint;
}

function validateOptionalText(value: unknown, location: string, maximumLength: number): string | undefined {
    return value === undefined ? undefined : validateText(value, location, maximumLength);
}

function validateText(value: unknown, location: string, maximumLength: number): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximumLength) {
        throw new BlueprintValidationError(`${location} must be a non-empty string no longer than ${maximumLength} characters.`);
    }
    return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BlueprintValidationError(message);
    }
    return value as Record<string, unknown>;
}

function requireArray(value: unknown, message: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new BlueprintValidationError(message);
    }
    return value;
}

function rejectUnexpectedProperties(
    value: Record<string, unknown>,
    allowedProperties: readonly string[],
    location: string
): void {
    const unexpectedProperty = Object.keys(value).find((property) => !allowedProperties.includes(property));
    if (unexpectedProperty) {
        throw new BlueprintValidationError(`${location} contains unsupported property "${unexpectedProperty}".`);
    }
}

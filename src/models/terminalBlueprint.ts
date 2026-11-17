export const TERMINAL_BLUEPRINT_SCHEMA_VERSION = 1;

export type BlueprintPackageManagerHint = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'composer' | 'maven' | 'gradle' | 'go' | 'cargo' | 'python';

export interface TerminalBlueprintCommand {
    id: string;
    label: string;
    command: string;
    description?: string;
    relativeWorkingDirectory?: string;
}

export interface TerminalBlueprint {
    id: string;
    name: string;
    description?: string;
    schemaVersion: typeof TERMINAL_BLUEPRINT_SCHEMA_VERSION;
    createdAt: string;
    updatedAt: string;
    commands: TerminalBlueprintCommand[];
    technologyHints?: string[];
    packageManagerHint?: BlueprintPackageManagerHint;
}

export interface TerminalBlueprintStorageDocument {
    schemaVersion: typeof TERMINAL_BLUEPRINT_SCHEMA_VERSION;
    blueprints: TerminalBlueprint[];
}

import * as vscode from 'vscode';
import { DiscoveredScript } from './packageJsonScanner';
import { hasSafeMetadataFile, readSafeMetadataFile } from './safeMetadataReader';

export interface PhpScanResult {
    technologies: string[];
    composerScripts: DiscoveredScript[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanPhpProject(projectUri: vscode.Uri): Promise<PhpScanResult | undefined> {
    const [composerJson, artisanExists] = await Promise.all([
        readTextFile(projectUri, 'composer.json'),
        hasSafeMetadataFile(projectUri, 'artisan')
    ]);

    return composerJson === undefined && !artisanExists
        ? undefined
        : analyzePhpMetadata(composerJson, artisanExists);
}

export function analyzePhpMetadata(
    composerJson: string | undefined,
    artisanExists: boolean
): PhpScanResult {
    const technologies: string[] = [];
    const composer = parseComposerJson(composerJson);

    if (composerJson !== undefined) {
        technologies.push('PHP', 'Composer');
    }

    if (artisanExists || declaresLaravel(composer)) {
        if (!technologies.includes('PHP')) {
            technologies.push('PHP');
        }
        technologies.push('Laravel');
    }

    return {
        technologies,
        composerScripts: extractComposerScripts(composer?.scripts)
    };
}

function parseComposerJson(composerJson: string | undefined): Record<string, unknown> | undefined {
    if (composerJson === undefined) {
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(composerJson);
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function declaresLaravel(composer: Record<string, unknown> | undefined): boolean {
    return composer?.name === 'laravel/laravel' ||
        dependencyGroupHasLaravel(composer?.require) ||
        dependencyGroupHasLaravel(composer?.['require-dev']);
}

function extractComposerScripts(value: unknown): DiscoveredScript[] {
    if (!isRecord(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([name, command]) => {
        if (typeof command === 'string') {
            return [{ name, command }];
        }

        if (Array.isArray(command) && command.every((entry) => typeof entry === 'string')) {
            return [{ name, command: command.join(' && ') }];
        }

        return [];
    });
}

function dependencyGroupHasLaravel(value: unknown): boolean {
    return isRecord(value) && 'laravel/framework' in value;
}

async function readTextFile(projectUri: vscode.Uri, fileName: string): Promise<string | undefined> {
    try {
        const contents = await readSafeMetadataFile(projectUri, fileName);
        return contents ? textDecoder.decode(contents) : undefined;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

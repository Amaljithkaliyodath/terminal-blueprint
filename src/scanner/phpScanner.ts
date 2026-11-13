import * as vscode from 'vscode';

export interface PhpScanResult {
    technologies: string[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanPhpProject(projectUri: vscode.Uri): Promise<PhpScanResult | undefined> {
    const [composerJson, artisanExists] = await Promise.all([
        readTextFile(vscode.Uri.joinPath(projectUri, 'composer.json')),
        fileExists(vscode.Uri.joinPath(projectUri, 'artisan'))
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

    if (composerJson !== undefined) {
        technologies.push('PHP', 'Composer');
    }

    if (artisanExists || declaresLaravel(composerJson)) {
        if (!technologies.includes('PHP')) {
            technologies.push('PHP');
        }
        technologies.push('Laravel');
    }

    return { technologies };
}

function declaresLaravel(composerJson: string | undefined): boolean {
    if (composerJson === undefined) {
        return false;
    }

    try {
        const parsed: unknown = JSON.parse(composerJson);
        if (!isRecord(parsed)) {
            return false;
        }

        return parsed.name === 'laravel/laravel' ||
            dependencyGroupHasLaravel(parsed.require) ||
            dependencyGroupHasLaravel(parsed['require-dev']);
    } catch {
        return false;
    }
}

function dependencyGroupHasLaravel(value: unknown): boolean {
    return isRecord(value) && 'laravel/framework' in value;
}

async function readTextFile(uri: vscode.Uri): Promise<string | undefined> {
    try {
        return textDecoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch {
        return undefined;
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return (stat.type & vscode.FileType.File) !== 0;
    } catch {
        return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import * as vscode from 'vscode';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PackageManagerDetection {
    name?: PackageManagerName;
    candidates: PackageManagerName[];
    source?: 'packageManager field' | 'lockfile';
    isAmbiguous: boolean;
}

export interface DiscoveredScript {
    name: string;
    command: string;
}

export interface PackageJsonScanResult {
    technologies: string[];
    packageManager?: PackageManagerDetection;
    scripts: DiscoveredScript[];
}

export function getScriptInvocation(
    scriptName: string,
    packageManager: PackageManagerDetection | undefined
): string | undefined {
    if (!packageManager?.name || packageManager.isAmbiguous) {
        return undefined;
    }

    switch (packageManager.name) {
        case 'npm':
            return `npm run ${scriptName}`;
        case 'pnpm':
            return `pnpm run ${scriptName}`;
        case 'yarn':
            return `yarn ${scriptName}`;
        case 'bun':
            return `bun run ${scriptName}`;
    }
}

interface PackageJson {
    packageManager?: unknown;
    dependencies?: unknown;
    devDependencies?: unknown;
    optionalDependencies?: unknown;
    peerDependencies?: unknown;
    scripts?: unknown;
}

const lockfiles: Readonly<Record<string, PackageManagerName>> = {
    'package-lock.json': 'npm',
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'bun.lock': 'bun',
    'bun.lockb': 'bun'
};

const textDecoder = new TextDecoder('utf-8');

export async function scanPackageJson(
    projectUri: vscode.Uri
): Promise<PackageJsonScanResult | undefined> {
    const packageJsonUri = vscode.Uri.joinPath(projectUri, 'package.json');
    const packageJson = await readPackageJson(packageJsonUri);

    if (!packageJson) {
        return undefined;
    }

    const presentLockfiles = await findPresentLockfiles(projectUri);
    return analyzePackageJson(packageJson, presentLockfiles);
}

export function analyzePackageJson(
    packageJson: PackageJson,
    presentLockfiles: readonly string[] = []
): PackageJsonScanResult {
    const dependencies = collectDependencyNames(packageJson);
    const technologies: string[] = [];

    if (dependencies.has('next')) {
        technologies.push('Next.js');
    }

    if (dependencies.has('react')) {
        technologies.push('React');
    }

    if (dependencies.has('typescript')) {
        technologies.push('TypeScript');
    }

    const packageManager = detectPackageManager(
        packageJson.packageManager,
        presentLockfiles
    );

    return {
        technologies,
        ...(packageManager ? { packageManager } : {}),
        scripts: extractScripts(packageJson.scripts)
    };
}

export function detectPackageManager(
    packageManagerField: unknown,
    presentLockfiles: readonly string[]
): PackageManagerDetection | undefined {
    const metadataManager = parsePackageManagerField(packageManagerField);
    const lockfileManagers = uniquePackageManagers(presentLockfiles);

    if (metadataManager) {
        const candidates = unique([metadataManager, ...lockfileManagers]);
        return {
            name: metadataManager,
            candidates,
            source: 'packageManager field',
            isAmbiguous: lockfileManagers.some(
                (manager) => manager !== metadataManager
            )
        };
    }

    if (lockfileManagers.length === 0) {
        return undefined;
    }

    return {
        ...(lockfileManagers.length === 1 ? { name: lockfileManagers[0] } : {}),
        candidates: lockfileManagers,
        source: 'lockfile',
        isAmbiguous: lockfileManagers.length > 1
    };
}

function extractScripts(scripts: unknown): DiscoveredScript[] {
    if (!isRecord(scripts)) {
        return [];
    }

    return Object.entries(scripts)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([name, command]) => ({ name, command }));
}

function collectDependencyNames(packageJson: PackageJson): Set<string> {
    const dependencyGroups = [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.optionalDependencies,
        packageJson.peerDependencies
    ];

    return new Set(
        dependencyGroups.flatMap((dependencies) =>
            isRecord(dependencies) ? Object.keys(dependencies) : []
        )
    );
}

async function readPackageJson(packageJsonUri: vscode.Uri): Promise<PackageJson | undefined> {
    try {
        const contents = await vscode.workspace.fs.readFile(packageJsonUri);
        const parsed: unknown = JSON.parse(textDecoder.decode(contents));
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        // Missing, inaccessible, or malformed package metadata must not fail a scan.
        return undefined;
    }
}

async function findPresentLockfiles(projectUri: vscode.Uri): Promise<string[]> {
    const entries = await Promise.all(
        Object.keys(lockfiles).map(async (fileName) => {
            try {
                const stat = await vscode.workspace.fs.stat(
                    vscode.Uri.joinPath(projectUri, fileName)
                );
                return (stat.type & vscode.FileType.File) !== 0 ? fileName : undefined;
            } catch {
                return undefined;
            }
        })
    );

    return entries.filter((entry): entry is string => entry !== undefined);
}

function parsePackageManagerField(value: unknown): PackageManagerName | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const manager = value.split('@', 1)[0];
    return isPackageManagerName(manager) ? manager : undefined;
}

function uniquePackageManagers(fileNames: readonly string[]): PackageManagerName[] {
    return unique(
        fileNames
            .map((fileName) => lockfiles[fileName])
            .filter((manager): manager is PackageManagerName => manager !== undefined)
    );
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function isPackageManagerName(value: string): value is PackageManagerName {
    return value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

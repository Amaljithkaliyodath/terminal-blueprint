
import * as vscode from 'vscode';
import {
    DiscoveredScript,
    PackageManagerDetection,
    scanPackageJson
} from './packageJsonScanner';
import { scanGoProject } from './goScanner';
import { scanJavaProject } from './javaScanner';
import { scanPhpProject } from './phpScanner';
import { scanPythonProject } from './pythonScanner';
import { scanRustProject } from './rustScanner';
import { hasSafeMetadataFile } from './safeMetadataReader';

// Structure of the scan result.
export interface ProjectInfo {
    name: string;
    relativePath: string;
    workingDirectory: vscode.Uri;
    technologies: string[];
    packageManager?: PackageManagerDetection;
    scripts: DiscoveredScript[];
    composerScripts: DiscoveredScript[];
    hasDjangoManagePy: boolean;
}

export interface WorkspaceFolderInfo {
    name: string;
    uri: vscode.Uri;
}

export interface ScanLimits {
    maxDepth: number;
    maxDirectories: number;
    excludedDirectoryNames?: readonly string[];
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
    maxDepth: 4,
    maxDirectories: 500
};

export const MANDATORY_IGNORED_DIRECTORY_NAMES = [
    '.git',
    '.next',
    '.venv',
    '__pycache__',
    'build',
    'coverage',
    'dist',
    'env',
    'node_modules',
    'out',
    'target',
    'venv'
] as const;
const hardMaximumScanDepth = 4;
const hardMaximumDirectoryCount = 500;

const projectMarkerFiles = new Set([
    'Cargo.toml',
    'Pipfile',
    'Pipfile.lock',
    'artisan',
    'build.gradle',
    'build.gradle.kts',
    'composer.json',
    'go.mod',
    'manage.py',
    'package.json',
    'poetry.lock',
    'pom.xml',
    'pyproject.toml',
    'requirements.txt',
    'uv.lock'
]);

// Detect technologies in opened workspace folders.
export async function scanProjects(limits: ScanLimits = DEFAULT_SCAN_LIMITS): Promise<ProjectInfo[]> {

    const folders = vscode.workspace.workspaceFolders;

    // No workspace is open.
    if (!folders || folders.length === 0) {
        return [];
    }

    return scanWorkspaceFolders(folders, limits);
}

export async function scanProjectFolder(
    name: string,
    folderUri: vscode.Uri,
    workspaceUri: vscode.Uri = folderUri
): Promise<ProjectInfo> {
    // Preserve a broad Node.js result even when package.json is malformed.
    // All other technologies are verified by their dedicated metadata scanners.
    const detectionFiles: Record<string, string> = {
        'package.json': 'Node.js ecosystem'
    };

    const technologies: string[] = [];

    for (const [fileName, technology] of Object.entries(detectionFiles)) {

        if (await hasSafeMetadataFile(folderUri, fileName) && !technologies.includes(technology)) {
            technologies.push(technology);
        }
    }

    const packageJson = await scanPackageJson(folderUri);
    const python = await scanPythonProject(folderUri);
    const php = await scanPhpProject(folderUri);
    const java = await scanJavaProject(folderUri);
    const go = await scanGoProject(folderUri);
    const rust = await scanRustProject(folderUri);

    for (const scanResult of [packageJson, python, php, java, go, rust]) {
        if (!scanResult) {
            continue;
        }

        for (const technology of scanResult.technologies) {
            if (!technologies.includes(technology)) {
                technologies.push(technology);
            }
        }
    }

    return {
        name,
        relativePath: getRelativePath(workspaceUri, folderUri),
        workingDirectory: folderUri,
        technologies,
        ...(packageJson?.packageManager
            ? { packageManager: packageJson.packageManager }
            : {}),
        scripts: packageJson?.scripts ?? [],
        composerScripts: php?.composerScripts ?? [],
        hasDjangoManagePy: python?.hasManagePy ?? false
    };
}

export async function scanWorkspaceFolders(
    folders: readonly WorkspaceFolderInfo[],
    limits: ScanLimits = DEFAULT_SCAN_LIMITS
): Promise<ProjectInfo[]> {
    const effectiveLimits = normalizeScanLimits(limits);
    const projects: ProjectInfo[] = [];

    for (const folder of folders) {
        projects.push(...await scanWorkspaceFolder(folder, effectiveLimits));
    }

    return projects;
}

export async function scanWorkspaceFolder(
    folder: WorkspaceFolderInfo,
    limits: ScanLimits = DEFAULT_SCAN_LIMITS
): Promise<ProjectInfo[]> {
    const effectiveLimits = normalizeScanLimits(limits);
    const discoveredFolders = await discoverProjectFolders(folder, effectiveLimits);
    const projects: ProjectInfo[] = [];

    for (const discoveredFolder of discoveredFolders) {
        projects.push(await scanProjectFolder(
            discoveredFolder.name,
            discoveredFolder.uri,
            folder.uri
        ));
    }

    return projects;
}

async function discoverProjectFolders(
    workspaceFolder: WorkspaceFolderInfo,
    limits: ScanLimits
): Promise<WorkspaceFolderInfo[]> {
    const discoveredFolders: WorkspaceFolderInfo[] = [workspaceFolder];
    const queue: Array<WorkspaceFolderInfo & { depth: number }> = [{
        ...workspaceFolder,
        depth: 0
    }];
    let scannedDirectoryCount = 0;

    while (queue.length > 0 && scannedDirectoryCount < limits.maxDirectories) {
        const currentFolder = queue.shift();
        if (!currentFolder) {
            break;
        }

        scannedDirectoryCount += 1;
        const entries = await readDirectory(currentFolder.uri);
        if (!entries || currentFolder.depth >= limits.maxDepth) {
            continue;
        }

        for (const [entryName, entryType] of entries) {
            if (scannedDirectoryCount + queue.length >= limits.maxDirectories) {
                break;
            }

            if (!isTraversableDirectory(entryName, entryType, limits.excludedDirectoryNames ?? MANDATORY_IGNORED_DIRECTORY_NAMES)) {
                continue;
            }

            const childFolder: WorkspaceFolderInfo & { depth: number } = {
                name: entryName,
                uri: vscode.Uri.joinPath(currentFolder.uri, entryName),
                depth: currentFolder.depth + 1
            };
            const childEntries = await readDirectory(childFolder.uri);

            if (childEntries && await containsProjectMarker(childFolder.uri, childEntries)) {
                discoveredFolders.push(childFolder);
            }

            queue.push(childFolder);
        }
    }

    return discoveredFolders.sort((left, right) => {
        const leftPath = getRelativePath(workspaceFolder.uri, left.uri);
        const rightPath = getRelativePath(workspaceFolder.uri, right.uri);

        if (leftPath === '.') {
            return -1;
        }

        if (rightPath === '.') {
            return 1;
        }

        return leftPath.localeCompare(rightPath);
    });
}

async function readDirectory(
    uri: vscode.Uri
): Promise<readonly [string, vscode.FileType][] | undefined> {
    try {
        return (await vscode.workspace.fs.readDirectory(uri))
            .sort(([leftName], [rightName]) => leftName.localeCompare(rightName));
    } catch {
        return undefined;
    }
}

function isTraversableDirectory(name: string, type: vscode.FileType, excludedDirectoryNames: readonly string[]): boolean {
    return (type & vscode.FileType.Directory) !== 0 &&
        (type & vscode.FileType.SymbolicLink) === 0 &&
        !excludedDirectoryNames.includes(name);
}

function normalizeScanLimits(limits: ScanLimits): ScanLimits {
    const maxDepth = Number.isInteger(limits.maxDepth) && limits.maxDepth >= 0
        ? Math.min(limits.maxDepth, hardMaximumScanDepth) : DEFAULT_SCAN_LIMITS.maxDepth;
    const maxDirectories = Number.isInteger(limits.maxDirectories) && limits.maxDirectories > 0
        ? Math.min(limits.maxDirectories, hardMaximumDirectoryCount) : DEFAULT_SCAN_LIMITS.maxDirectories;
    const additionalExclusions = (limits.excludedDirectoryNames ?? []).filter(isSafeDirectoryName);
    return { maxDepth, maxDirectories, excludedDirectoryNames: [...new Set([...MANDATORY_IGNORED_DIRECTORY_NAMES, ...additionalExclusions])] };
}

function isSafeDirectoryName(value: string): boolean {
    return /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/.test(value);
}

async function containsProjectMarker(projectUri: vscode.Uri, entries: readonly [string, vscode.FileType][]): Promise<boolean> {
    for (const [name, type] of entries) {
        if ((type & vscode.FileType.File) !== 0 && projectMarkerFiles.has(name) && await hasSafeMetadataFile(projectUri, name)) {
            return true;
        }
    }
    return false;
}

function getRelativePath(workspaceUri: vscode.Uri, projectUri: vscode.Uri): string {
    const workspacePath = workspaceUri.path.replace(/\/$/, '');

    if (
        workspaceUri.scheme !== projectUri.scheme ||
        workspaceUri.authority !== projectUri.authority ||
        !projectUri.path.startsWith(`${workspacePath}/`)
    ) {
        return '.';
    }

    return projectUri.path.slice(workspacePath.length + 1) || '.';
}

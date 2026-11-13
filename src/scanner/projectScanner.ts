
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

// Structure of the scan result.
export interface ProjectInfo {
    name: string;
    relativePath: string;
    workingDirectory: vscode.Uri;
    technologies: string[];
    packageManager?: PackageManagerDetection;
    scripts: DiscoveredScript[];
}

export interface WorkspaceFolderInfo {
    name: string;
    uri: vscode.Uri;
}

export interface ScanLimits {
    maxDepth: number;
    maxDirectories: number;
}

const defaultScanLimits: ScanLimits = {
    maxDepth: 4,
    maxDirectories: 500
};

const ignoredDirectoryNames = new Set([
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
]);

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
export async function scanProjects(): Promise<ProjectInfo[]> {

    const folders = vscode.workspace.workspaceFolders;

    // No workspace is open.
    if (!folders || folders.length === 0) {
        return [];
    }

    return scanWorkspaceFolders(folders);
}

export async function scanProjectFolder(
    name: string,
    folderUri: vscode.Uri,
    workspaceUri: vscode.Uri = folderUri
): Promise<ProjectInfo> {
    // Files that indicate particular project ecosystems.
    const detectionFiles: Record<string, string> = {
        'package.json': 'Node.js ecosystem',
        'pyproject.toml': 'Python',
        'requirements.txt': 'Python',
        'composer.json': 'PHP',
        'pom.xml': 'Java (Maven)',
        'build.gradle': 'Java / Gradle',
        'build.gradle.kts': 'Java / Kotlin (Gradle)',
        'go.mod': 'Go',
        'Cargo.toml': 'Rust'
    };

    const technologies: string[] = [];

    for (const [fileName, technology] of Object.entries(detectionFiles)) {

        const fileUri = vscode.Uri.joinPath(
            folderUri,
            fileName
        );

        try {

            // Check whether the file exists.
            const stat = await vscode.workspace.fs.stat(fileUri);

            // Only accept regular files.
            if (
                (stat.type & vscode.FileType.File) !== 0 &&
                !technologies.includes(technology)
            ) {
                technologies.push(technology);
            }

        } catch {
            // Missing or inaccessible file.
            // Continue scanning other files.
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
        scripts: packageJson?.scripts ?? []
    };
}

export async function scanWorkspaceFolders(
    folders: readonly WorkspaceFolderInfo[],
    limits: ScanLimits = defaultScanLimits
): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];

    for (const folder of folders) {
        projects.push(...await scanWorkspaceFolder(folder, limits));
    }

    return projects;
}

export async function scanWorkspaceFolder(
    folder: WorkspaceFolderInfo,
    limits: ScanLimits = defaultScanLimits
): Promise<ProjectInfo[]> {
    const discoveredFolders = await discoverProjectFolders(folder, limits);
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

            if (!isTraversableDirectory(entryName, entryType)) {
                continue;
            }

            const childFolder: WorkspaceFolderInfo & { depth: number } = {
                name: entryName,
                uri: vscode.Uri.joinPath(currentFolder.uri, entryName),
                depth: currentFolder.depth + 1
            };
            const childEntries = await readDirectory(childFolder.uri);

            if (childEntries && containsProjectMarker(childEntries)) {
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

function isTraversableDirectory(name: string, type: vscode.FileType): boolean {
    return (type & vscode.FileType.Directory) !== 0 &&
        (type & vscode.FileType.SymbolicLink) === 0 &&
        !ignoredDirectoryNames.has(name);
}

function containsProjectMarker(entries: readonly [string, vscode.FileType][]): boolean {
    return entries.some(([name, type]) =>
        (type & vscode.FileType.File) !== 0 && projectMarkerFiles.has(name)
    );
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

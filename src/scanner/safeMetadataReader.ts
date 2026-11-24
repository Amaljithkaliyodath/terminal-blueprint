import * as vscode from 'vscode';

export interface MetadataFileSystem {
    stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
}

/**
 * Reads only a regular, non-symlink metadata file directly below a project root.
 * A stat/read sequence cannot eliminate a filesystem TOCTOU race; callers must
 * still treat returned metadata as untrusted.
 */
export async function readSafeMetadataFile(
    projectUri: vscode.Uri,
    fileName: string,
    fileSystem: MetadataFileSystem = vscode.workspace.fs
): Promise<Uint8Array | undefined> {
    const uri = metadataUri(projectUri, fileName);
    if (!uri || !await isSafeRegularFile(uri, projectUri, fileSystem)) {
        return undefined;
    }
    try {
        return await fileSystem.readFile(uri);
    } catch {
        return undefined;
    }
}

export async function hasSafeMetadataFile(
    projectUri: vscode.Uri,
    fileName: string,
    fileSystem: MetadataFileSystem = vscode.workspace.fs
): Promise<boolean> {
    const uri = metadataUri(projectUri, fileName);
    return uri !== undefined && isSafeRegularFile(uri, projectUri, fileSystem);
}

function metadataUri(projectUri: vscode.Uri, fileName: string): vscode.Uri | undefined {
    if (!isSimpleFileName(fileName)) {
        return undefined;
    }
    const uri = vscode.Uri.joinPath(projectUri, fileName);
    return isWithinProjectBoundary(uri, projectUri) ? uri : undefined;
}

async function isSafeRegularFile(uri: vscode.Uri, projectUri: vscode.Uri, fileSystem: MetadataFileSystem): Promise<boolean> {
    if (!isWithinProjectBoundary(uri, projectUri)) {
        return false;
    }
    try {
        const stat = await fileSystem.stat(uri);
        return (stat.type & vscode.FileType.File) !== 0 &&
            (stat.type & vscode.FileType.SymbolicLink) === 0;
    } catch {
        return false;
    }
}

function isSimpleFileName(value: string): boolean {
    return value.length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value);
}

function isWithinProjectBoundary(candidate: vscode.Uri, projectUri: vscode.Uri): boolean {
    if (candidate.scheme !== projectUri.scheme || candidate.authority !== projectUri.authority) {
        return false;
    }
    const rootPath = projectUri.path.replace(/\/$/, '') || '/';
    const prefix = rootPath === '/' ? '/' : `${rootPath}/`;
    return candidate.path.startsWith(prefix);
}

import * as path from 'path';

export function normalizePathForComparison(filePath: string): string {
    const normalizedPath = path.normalize(filePath);
    return process.platform === 'win32'
        ? normalizedPath.toLowerCase()
        : normalizedPath;
}

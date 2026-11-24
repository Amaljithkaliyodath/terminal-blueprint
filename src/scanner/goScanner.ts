import * as vscode from 'vscode';
import { readSafeMetadataFile } from './safeMetadataReader';

export interface GoScanResult {
    technologies: string[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanGoProject(projectUri: vscode.Uri): Promise<GoScanResult | undefined> {
    try {
        const metadata = await readSafeMetadataFile(projectUri, 'go.mod');
        if (!metadata) { return undefined; }
        const contents = textDecoder.decode(metadata);
        return analyzeGoMod(contents);
    } catch {
        return undefined;
    }
}

export function analyzeGoMod(contents: string): GoScanResult {
    return /^\s*module\s+\S+/m.test(contents)
        ? { technologies: ['Go', 'Go modules'] }
        : { technologies: [] };
}

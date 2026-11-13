import * as vscode from 'vscode';

export interface GoScanResult {
    technologies: string[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanGoProject(projectUri: vscode.Uri): Promise<GoScanResult | undefined> {
    try {
        const contents = textDecoder.decode(await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(projectUri, 'go.mod')
        ));
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

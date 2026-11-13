import * as vscode from 'vscode';

export interface RustScanResult {
    technologies: string[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanRustProject(projectUri: vscode.Uri): Promise<RustScanResult | undefined> {
    try {
        const contents = textDecoder.decode(await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(projectUri, 'Cargo.toml')
        ));
        return analyzeCargoToml(contents);
    } catch {
        return undefined;
    }
}

export function analyzeCargoToml(contents: string): RustScanResult {
    return /^\s*\[(package|workspace)\]/m.test(contents)
        ? { technologies: ['Rust', 'Cargo'] }
        : { technologies: [] };
}

import * as vscode from 'vscode';
import { readSafeMetadataFile } from './safeMetadataReader';

export interface RustScanResult {
    technologies: string[];
}

const textDecoder = new TextDecoder('utf-8');

export async function scanRustProject(projectUri: vscode.Uri): Promise<RustScanResult | undefined> {
    try {
        const metadata = await readSafeMetadataFile(projectUri, 'Cargo.toml');
        if (!metadata) { return undefined; }
        const contents = textDecoder.decode(metadata);
        return analyzeCargoToml(contents);
    } catch {
        return undefined;
    }
}

export function analyzeCargoToml(contents: string): RustScanResult {
    return isValidCargoPackage(contents) || isValidCargoWorkspace(contents)
        ? { technologies: ['Rust', 'Cargo'] }
        : { technologies: [] };
}

function isValidCargoPackage(contents: string): boolean {
    const packageSection = getTomlSection(contents, 'package');
    return packageSection !== undefined &&
        hasTomlString(packageSection, 'name') &&
        hasTomlString(packageSection, 'version');
}

function isValidCargoWorkspace(contents: string): boolean {
    const workspaceSection = getTomlSection(contents, 'workspace');
    return workspaceSection !== undefined &&
        /^\s*members\s*=\s*\[\s*['"][^'"\r\n]+['"](?:\s*,\s*['"][^'"\r\n]+['"])*\s*,?\s*\]/m.test(workspaceSection);
}

function getTomlSection(contents: string, sectionName: string): string | undefined {
    const section = new RegExp(
        `^\\s*\\[${escapeRegExp(sectionName)}\\]\\s*(?:#.*)?$([\\s\\S]*?)(?=^\\s*\\[|(?![\\s\\S]))`,
        'm'
    ).exec(contents);
    return section?.[1];
}

function hasTomlString(section: string, key: string): boolean {
    return new RegExp(
        `^\\s*${escapeRegExp(key)}\\s*=\\s*(['"])[^'"\\r\\n]+\\1\\s*(?:#.*)?$`,
        'm'
    ).test(section);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

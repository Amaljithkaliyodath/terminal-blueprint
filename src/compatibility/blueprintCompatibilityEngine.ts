import * as vscode from 'vscode';
import { TerminalBlueprint, TerminalBlueprintCommand } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';

export type BlueprintCompatibilityStatus = 'COMPATIBLE' | 'WARNING' | 'INCOMPATIBLE';
export type BlueprintCompatibilityIssueCode =
    | 'technology-match' | 'technology-mismatch' | 'technology-unknown'
    | 'package-manager-match' | 'package-manager-mismatch' | 'package-manager-ambiguous' | 'package-manager-unknown'
    | 'working-directory-available' | 'working-directory-missing' | 'working-directory-invalid' | 'working-directory-unverified';

export interface BlueprintCompatibilityIssue {
    code: BlueprintCompatibilityIssueCode;
    message: string;
}

export interface CommandWorkingDirectoryFinding {
    commandId: string;
    relativePath: string;
    status: 'AVAILABLE' | 'MISSING' | 'INVALID' | 'UNVERIFIED';
    workingDirectory?: vscode.Uri;
    message: string;
}

export interface BlueprintCompatibilityResult {
    status: BlueprintCompatibilityStatus;
    reasons: string[];
    matchedRequirements: BlueprintCompatibilityIssue[];
    warnings: BlueprintCompatibilityIssue[];
    mismatches: BlueprintCompatibilityIssue[];
    commandWorkingDirectories: CommandWorkingDirectoryFinding[];
}

export interface CompatibilityFileSystem {
    stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
}

class UnsafeDirectoryError extends Error {}

const technologyAliases: Readonly<Record<string, string>> = {
    'node': 'Node.js ecosystem', 'node.js': 'Node.js ecosystem', 'node.js ecosystem': 'Node.js ecosystem',
    'next': 'Next.js', 'next.js': 'Next.js', 'nextjs': 'Next.js',
    'react': 'React', 'typescript': 'TypeScript', 'ts': 'TypeScript',
    'python': 'Python', 'django': 'Django', 'flask': 'Flask', 'fastapi': 'FastAPI',
    'php': 'PHP', 'composer': 'Composer', 'laravel': 'Laravel',
    'java': 'Java', 'kotlin': 'Kotlin', 'maven': 'Maven', 'gradle': 'Gradle', 'spring boot': 'Spring Boot', 'springboot': 'Spring Boot',
    'go': 'Go', 'go modules': 'Go modules', 'gomodules': 'Go modules',
    'rust': 'Rust', 'cargo': 'Cargo'
};

const packageManagerTechnologies: Readonly<Record<string, string>> = {
    composer: 'Composer', maven: 'Maven', gradle: 'Gradle', go: 'Go modules', cargo: 'Cargo', python: 'Python'
};

/** Evaluates metadata only; it never authorizes or executes a blueprint command. */
export async function evaluateBlueprintCompatibility(
    blueprint: TerminalBlueprint,
    project: ProjectInfo,
    fileSystem: CompatibilityFileSystem = vscode.workspace.fs
): Promise<BlueprintCompatibilityResult> {
    const matchedRequirements: BlueprintCompatibilityIssue[] = [];
    const warnings: BlueprintCompatibilityIssue[] = [];
    const mismatches: BlueprintCompatibilityIssue[] = [];
    evaluateTechnologies(blueprint, project, matchedRequirements, warnings, mismatches);
    evaluatePackageManager(blueprint, project, matchedRequirements, warnings, mismatches);
    const commandWorkingDirectories = await Promise.all(blueprint.commands.map((command) =>
        inspectWorkingDirectory(command, project.workingDirectory, fileSystem)
    ));

    for (const finding of commandWorkingDirectories) {
        const issue: BlueprintCompatibilityIssue = { code: directoryCode(finding.status), message: finding.message };
        if (finding.status === 'AVAILABLE') { matchedRequirements.push(issue); }
        else if (finding.status === 'UNVERIFIED') { warnings.push(issue); }
        else { mismatches.push(issue); }
    }
    const status: BlueprintCompatibilityStatus = mismatches.length > 0
        ? 'INCOMPATIBLE' : warnings.length > 0 ? 'WARNING' : 'COMPATIBLE';
    return {
        status,
        reasons: [...mismatches, ...warnings, ...matchedRequirements].map((issue) => issue.message),
        matchedRequirements,
        warnings,
        mismatches,
        commandWorkingDirectories
    };
}

function evaluateTechnologies(
    blueprint: TerminalBlueprint,
    project: ProjectInfo,
    matches: BlueprintCompatibilityIssue[],
    warnings: BlueprintCompatibilityIssue[],
    mismatches: BlueprintCompatibilityIssue[]
): void {
    const hints = blueprint.technologyHints ?? [];
    if (hints.length === 0) {
        matches.push({ code: 'technology-match', message: 'Blueprint has no technology requirements.' });
        return;
    }
    const detected = new Set(project.technologies.map(normalizeTechnology).filter((value): value is string => value !== undefined));
    const seen = new Set<string>();
    for (const hint of hints) {
        const normalized = normalizeTechnology(hint);
        if (!normalized) {
            warnings.push({ code: 'technology-unknown', message: `Technology hint "${hint}" is not supported by scanner matching.` });
        } else if (seen.has(normalized)) {
            continue;
        } else if (detected.has(normalized)) {
            matches.push({ code: 'technology-match', message: `Detected required technology ${normalized}.` });
        } else if (detected.size === 0) {
            warnings.push({ code: 'technology-unknown', message: `Could not verify required technology ${normalized} from project metadata.` });
        } else {
            mismatches.push({ code: 'technology-mismatch', message: `Project metadata does not detect required technology ${normalized}.` });
        }
        if (normalized) { seen.add(normalized); }
    }
}

function evaluatePackageManager(
    blueprint: TerminalBlueprint,
    project: ProjectInfo,
    matches: BlueprintCompatibilityIssue[],
    warnings: BlueprintCompatibilityIssue[],
    mismatches: BlueprintCompatibilityIssue[]
): void {
    const hint = blueprint.packageManagerHint;
    if (!hint) { return; }
    if (hint === 'npm' || hint === 'pnpm' || hint === 'yarn' || hint === 'bun') {
        if (!project.packageManager) {
            warnings.push({ code: 'package-manager-unknown', message: `Could not verify required package manager ${hint}.` });
        } else if (project.packageManager.isAmbiguous || !project.packageManager.name) {
            warnings.push({ code: 'package-manager-ambiguous', message: `Project package-manager metadata is ambiguous; ${hint} was not assumed.` });
        } else if (project.packageManager.name === hint) {
            matches.push({ code: 'package-manager-match', message: `Detected required package manager ${hint}.` });
        } else {
            mismatches.push({ code: 'package-manager-mismatch', message: `Blueprint requires ${hint}, but project metadata verifies ${project.packageManager.name}.` });
        }
        return;
    }
    const requiredTechnology = packageManagerTechnologies[hint];
    if (!requiredTechnology) {
        warnings.push({ code: 'package-manager-unknown', message: `Package-manager hint "${String(hint)}" is not supported by scanner matching.` });
        return;
    }
    const detected = new Set(project.technologies.map(normalizeTechnology).filter((value): value is string => value !== undefined));
    const knownToolDetected = Object.values(packageManagerTechnologies).some((technology) => detected.has(technology));
    if (detected.has(requiredTechnology)) {
        matches.push({ code: 'package-manager-match', message: `Detected required package tool ${hint}.` });
    } else if (knownToolDetected) {
        mismatches.push({ code: 'package-manager-mismatch', message: `Project metadata does not verify required package tool ${hint}.` });
    } else {
        warnings.push({ code: 'package-manager-unknown', message: `Could not verify required package tool ${hint}.` });
    }
}

async function inspectWorkingDirectory(
    command: TerminalBlueprintCommand,
    projectRoot: vscode.Uri,
    fileSystem: CompatibilityFileSystem
): Promise<CommandWorkingDirectoryFinding> {
    const relativePath = command.relativeWorkingDirectory ?? '.';
    const segments = relativePath.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== '.');
    if (isUnsafeRelativePath(relativePath, segments)) {
        return { commandId: command.id, relativePath, status: 'INVALID', message: `Command "${command.label}" has an invalid relative working directory.` };
    }
    let current = projectRoot;
    try {
        await ensureDirectory(current, fileSystem);
        for (const segment of segments) {
            current = vscode.Uri.joinPath(current, segment);
            await ensureDirectory(current, fileSystem);
        }
        return { commandId: command.id, relativePath, status: 'AVAILABLE', workingDirectory: current, message: `Working directory "${relativePath}" is available for command "${command.label}".` };
    } catch (error) {
        const status = error instanceof UnsafeDirectoryError ? 'INVALID' : isFileNotFound(error) ? 'MISSING' : 'UNVERIFIED';
        return {
            commandId: command.id,
            relativePath,
            status,
            message: status === 'MISSING'
                ? `Working directory "${relativePath}" is missing for command "${command.label}".`
                : `Could not safely inspect working directory "${relativePath}" for command "${command.label}".`
        };
    }
}

function normalizeTechnology(value: string): string | undefined {
    return technologyAliases[value.trim().toLowerCase()];
}

function isUnsafeRelativePath(relativePath: string, segments: readonly string[]): boolean {
    return relativePath.startsWith('/') || relativePath.startsWith('\\') || /^[A-Za-z]:/.test(relativePath) ||
        relativePath.split(/[\\/]+/).includes('..') || segments.some((segment) => segment === '..');
}

async function ensureDirectory(uri: vscode.Uri, fileSystem: CompatibilityFileSystem): Promise<void> {
    const stat = await fileSystem.stat(uri);
    if ((stat.type & vscode.FileType.SymbolicLink) !== 0 || (stat.type & vscode.FileType.Directory) === 0) {
        throw new UnsafeDirectoryError('Directory is missing or unsafe.');
    }
}

function isFileNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'FileNotFound';
}

function directoryCode(status: CommandWorkingDirectoryFinding['status']): BlueprintCompatibilityIssueCode {
    switch (status) {
        case 'AVAILABLE': return 'working-directory-available';
        case 'MISSING': return 'working-directory-missing';
        case 'INVALID': return 'working-directory-invalid';
        case 'UNVERIFIED': return 'working-directory-unverified';
    }
}

import * as vscode from 'vscode';
import { CommandSuggestion } from '../models/commandSuggestion';

export interface SuggestedCommandQuickPickItem {
    label: string;
    description: string;
    detail: string;
    suggestion: CommandSuggestion;
}

export interface CommandPreview {
    command: string;
    projectName: string;
    relativePath: string;
    workingDirectory: vscode.Uri;
    source: string;
    reason: string;
    message: string;
}

export type CommandPreviewResult =
    | 'executed'
    | 'cancelled'
    | 'no-suggestions'
    | 'untrusted-workspace'
    | 'unavailable-working-directory'
    | 'invalid-suggestion'
    | 'terminal-creation-failed';

export interface CommandSelectionUi {
    pickSuggestion(items: readonly SuggestedCommandQuickPickItem[]): Promise<CommandSuggestion | undefined>;
    requestApproval(preview: CommandPreview): Promise<boolean>;
    showInformation(message: string): void;
    showWarning(message: string): void;
}

export interface WorkingDirectoryVerifier {
    isAvailable(uri: vscode.Uri): Promise<boolean>;
}

export interface TerminalHandle {
    sendText(text: string, addNewLine?: boolean): void;
    show(preserveFocus?: boolean): void;
}

export interface TerminalService {
    createTerminal(options: { name: string; cwd: vscode.Uri }): TerminalHandle;
}

interface ApprovedExecutionPlan {
    command: string;
    workingDirectory: vscode.Uri;
    terminalName: string;
}

export function createSuggestedCommandItems(
    suggestions: readonly CommandSuggestion[]
): SuggestedCommandQuickPickItem[] {
    return [...suggestions]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((suggestion) => ({
            label: suggestion.title,
            description: `${suggestion.command} — ${suggestion.project.name} (${suggestion.project.relativePath})`,
            detail: `Working directory: ${formatWorkingDirectory(suggestion.workingDirectory)}`,
            suggestion
        }));
}

export function createCommandPreview(suggestion: CommandSuggestion): CommandPreview {
    const workingDirectory = formatWorkingDirectory(suggestion.workingDirectory);
    return {
        command: suggestion.command,
        projectName: suggestion.project.name,
        relativePath: suggestion.project.relativePath,
        workingDirectory: suggestion.workingDirectory,
        source: suggestion.source,
        reason: suggestion.reason,
        message: [
            'Review the command before approving:',
            `Command: ${suggestion.command}`,
            `Project: ${suggestion.project.name} (${suggestion.project.relativePath})`,
            `Working directory: ${workingDirectory}`,
            `Source: ${suggestion.source}`,
            `Reason: ${suggestion.reason}`
        ].join('\n')
    };
}

export async function selectAndRunSuggestedCommand(
    suggestions: readonly CommandSuggestion[],
    isWorkspaceTrusted: () => boolean,
    ui: CommandSelectionUi,
    workingDirectoryVerifier: WorkingDirectoryVerifier,
    terminalService: TerminalService
): Promise<CommandPreviewResult> {
    if (!isWorkspaceTrusted()) {
        ui.showWarning('Terminal Blueprint: Command execution is unavailable in an untrusted workspace.');
        return 'untrusted-workspace';
    }

    if (suggestions.length === 0) {
        ui.showInformation('Terminal Blueprint: No safe command suggestions are available in this workspace.');
        return 'no-suggestions';
    }

    const selected = await ui.pickSuggestion(createSuggestedCommandItems(suggestions));
    if (!selected) {
        return 'cancelled';
    }

    const executionPlan = createApprovedExecutionPlan(selected);
    if (!executionPlan) {
        ui.showWarning('Terminal Blueprint: The selected suggestion is no longer valid. Rescan the workspace and try again.');
        return 'invalid-suggestion';
    }

    if (!await workingDirectoryVerifier.isAvailable(selected.workingDirectory)) {
        ui.showWarning('Terminal Blueprint: The selected project folder is no longer available. Rescan the workspace and try again.');
        return 'unavailable-working-directory';
    }

    const approved = await ui.requestApproval(createCommandPreview(selected));
    if (!approved) {
        return 'cancelled';
    }

    // Recheck mutable workspace state after the user approves and immediately
    // before the only terminal-creation call.
    if (!isWorkspaceTrusted()) {
        ui.showWarning('Terminal Blueprint: Command execution is unavailable in an untrusted workspace.');
        return 'untrusted-workspace';
    }

    if (!await workingDirectoryVerifier.isAvailable(executionPlan.workingDirectory)) {
        ui.showWarning('Terminal Blueprint: The selected project folder is no longer available. Rescan the workspace and try again.');
        return 'unavailable-working-directory';
    }

    try {
        const terminal = terminalService.createTerminal({
            name: executionPlan.terminalName,
            cwd: executionPlan.workingDirectory
        });
        terminal.sendText(executionPlan.command, true);
        terminal.show(false);
        return 'executed';
    } catch {
        ui.showWarning('Terminal Blueprint: Unable to create a terminal for the approved command.');
        return 'terminal-creation-failed';
    }
}

export function isSafeSuggestionForExecution(suggestion: CommandSuggestion): boolean {
    if (suggestion.workingDirectory.toString() !== suggestion.project.workingDirectory.toString()) {
        return false;
    }

    const safeIdentifier = '[A-Za-z0-9:_-]+';
    const commandPatterns: Readonly<Record<CommandSuggestion['source'], RegExp>> = {
        'package.json script': new RegExp(`^(npm run|pnpm run|yarn|bun run) ${safeIdentifier}$`),
        'composer script': new RegExp(`^composer run ${safeIdentifier}$`),
        'Maven lifecycle': /^(mvn test|mvn package)$/,
        'Gradle standard task': /^gradle tasks$/,
        'Go module': /^(go test \.\/\.\.\.|go build \.\/\.\.\.)$/,
        'Cargo package': /^(cargo test|cargo build)$/,
        'Django manage.py': /^python manage\.py runserver$/
    };

    return commandPatterns[suggestion.source].test(suggestion.command);
}

function createApprovedExecutionPlan(suggestion: CommandSuggestion): ApprovedExecutionPlan | undefined {
    if (!isSafeSuggestionForExecution(suggestion)) {
        return undefined;
    }

    return Object.freeze({
        command: suggestion.command,
        workingDirectory: suggestion.workingDirectory,
        terminalName: `Terminal Blueprint: ${sanitizeTerminalName(suggestion.project.name)}`
    });
}

function formatWorkingDirectory(uri: vscode.Uri): string {
    return uri.fsPath || uri.toString();
}

function sanitizeTerminalName(name: string): string {
    return name.replace(/[\r\n\t\0-\x1F\x7F]/g, ' ').trim().slice(0, 80) || 'Project';
}

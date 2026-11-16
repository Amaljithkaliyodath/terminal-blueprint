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
    | 'approved'
    | 'cancelled'
    | 'no-suggestions'
    | 'untrusted-workspace'
    | 'unavailable-working-directory';

export interface CommandSelectionUi {
    pickSuggestion(items: readonly SuggestedCommandQuickPickItem[]): Promise<CommandSuggestion | undefined>;
    requestApproval(preview: CommandPreview): Promise<boolean>;
    showInformation(message: string): void;
    showWarning(message: string): void;
}

export interface WorkingDirectoryVerifier {
    isAvailable(uri: vscode.Uri): Promise<boolean>;
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

export async function selectAndPreviewSuggestedCommand(
    suggestions: readonly CommandSuggestion[],
    isWorkspaceTrusted: boolean,
    ui: CommandSelectionUi,
    workingDirectoryVerifier: WorkingDirectoryVerifier
): Promise<CommandPreviewResult> {
    if (!isWorkspaceTrusted) {
        ui.showWarning('Terminal Blueprint: Command approval is unavailable in an untrusted workspace.');
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

    if (!await workingDirectoryVerifier.isAvailable(selected.workingDirectory)) {
        ui.showWarning('Terminal Blueprint: The selected project folder is no longer available. Rescan the workspace and try again.');
        return 'unavailable-working-directory';
    }

    const approved = await ui.requestApproval(createCommandPreview(selected));
    if (!approved) {
        return 'cancelled';
    }

    ui.showInformation('Command approved. Terminal execution will be available in the next checkpoint.');
    return 'approved';
}

function formatWorkingDirectory(uri: vscode.Uri): string {
    return uri.fsPath || uri.toString();
}

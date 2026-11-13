import * as vscode from 'vscode';
import { ProjectInfo } from '../scanner/projectScanner';

export type CommandSuggestionSource = 'package.json script';

export interface CommandSuggestion {
    id: string;
    title: string;
    description: string;
    command: string;
    workingDirectory: vscode.Uri;
    project: ProjectInfo;
    source: CommandSuggestionSource;
    reason: string;
}

export type CommandSuggestionWarningCode =
    | 'ambiguous-package-manager'
    | 'missing-package-manager';

export interface CommandSuggestionWarning {
    id: string;
    code: CommandSuggestionWarningCode;
    description: string;
    project: ProjectInfo;
}

export interface CommandSuggestionResult {
    suggestions: CommandSuggestion[];
    warnings: CommandSuggestionWarning[];
}

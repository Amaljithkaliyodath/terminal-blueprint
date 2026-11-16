import * as vscode from 'vscode';
import type { TerminalHandle } from './commandSelectionController';

export interface TerminalCloseEventSource {
    onDidCloseTerminal(listener: (terminal: TerminalHandle) => void): vscode.Disposable;
}

export interface TerminalTracker {
    createTerminalName(projectName: string, command: string): string;
    track(terminal: TerminalHandle, name: string, command: string, workingDirectory: vscode.Uri): void;
}

export interface TrackedTerminal {
    terminal: TerminalHandle;
    name: string;
    command: string;
    workingDirectory: vscode.Uri;
}

export class TerminalLifecycleManager implements TerminalTracker, vscode.Disposable {
    private readonly terminals = new Map<TerminalHandle, TrackedTerminal>();
    private readonly closeSubscription: vscode.Disposable;
    private nextTerminalNumber = 1;

    public constructor(eventSource: TerminalCloseEventSource) {
        this.closeSubscription = eventSource.onDidCloseTerminal((terminal) => {
            this.terminals.delete(terminal);
        });
    }

    public createTerminalName(projectName: string, command: string): string {
        const number = this.nextTerminalNumber;
        this.nextTerminalNumber += 1;
        return `Terminal Blueprint: ${sanitizeNamePart(projectName)} - ${sanitizeNamePart(command)} (${number})`;
    }

    public track(terminal: TerminalHandle, name: string, command: string, workingDirectory: vscode.Uri): void {
        this.terminals.set(terminal, { terminal, name, command, workingDirectory });
    }

    public get trackedTerminalCount(): number {
        return this.terminals.size;
    }

    public dispose(): void {
        this.closeSubscription.dispose();
        this.terminals.clear();
    }
}

function sanitizeNamePart(value: string): string {
    return value.replace(/[\r\n\t\0-\x1F\x7F]/g, ' ').trim().slice(0, 60) || 'Project';
}

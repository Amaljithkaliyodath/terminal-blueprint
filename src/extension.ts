
import * as vscode from 'vscode';
import {
    CommandPreview,
    CommandSelectionUi,
    SuggestedCommandQuickPickItem,
    TerminalService,
    selectAndRunSuggestedCommand
} from './launcher/commandSelectionController';
import { TerminalLifecycleManager } from './launcher/terminalLifecycleManager';
import { createBlueprintFromInputs, manageBlueprintsFromInputs } from './blueprints/blueprintManagementController';
import { BlueprintManagementService } from './blueprints/blueprintManagementService';
import { formatScanOutput } from './output/scanOutputFormatter';
import { scanProjects } from './scanner/projectScanner';
import { generateCommandSuggestions } from './suggestions/commandSuggestionEngine';
import { BlueprintStorageService } from './storage/blueprintStorageService';

export function activate(context: vscode.ExtensionContext) {

    console.log('Terminal Blueprint extension activated.');

    // Create one Output Channel for our extension.
    const output = vscode.window.createOutputChannel(
        'Terminal Blueprint'
    );
    const terminalLifecycleManager = new TerminalLifecycleManager({
        onDidCloseTerminal(listener) {
            return vscode.window.onDidCloseTerminal(listener);
        }
    });
    const blueprintManagementService = new BlueprintManagementService(
        new BlueprintStorageService(context.globalStorageUri)
    );

    // Command 1: Display extension information.
    const helloWorld = vscode.commands.registerCommand(
        'terminal-blueprint.helloWorld',
        () => {
            vscode.window.showInformationMessage(
                `Terminal Blueprint is running on VS Code ${vscode.version}`
            );
        }
    );

    // Command 2: Scan the opened project.
    const scanProject = vscode.commands.registerCommand(
        'terminal-blueprint.scanProject',
        async () => {
            try {
                const projects = await scanProjects();

                // Check whether a workspace is open.
                if (projects.length === 0) {
                    vscode.window.showWarningMessage(
                        'Terminal Blueprint: Please open a project folder before scanning.'
                    );
                    return;
                }

                // Clear previous results.
                output.clear();

                const suggestionResult = generateCommandSuggestions(projects);

                for (const line of formatScanOutput(projects, suggestionResult)) {
                    output.appendLine(line);
                }

                // Open the Output panel.
                output.show();

            } catch (error) {

                // Log technical details for debugging.
                console.error(
                    'Terminal Blueprint scan failed:',
                    error
                );

                // Show a friendly error to the user.
                vscode.window.showErrorMessage(
                    'Terminal Blueprint: Unable to scan the project. Check the developer console for details.'
                );
            }
        }
    );

    const runSuggestedCommand = vscode.commands.registerCommand(
        'terminal-blueprint.runSuggestedCommand',
        async () => {
            try {
                const projects = await scanProjects();
                if (projects.length === 0) {
                    vscode.window.showWarningMessage(
                        'Terminal Blueprint: Please open a project folder before selecting a command.'
                    );
                    return;
                }

                const suggestions = generateCommandSuggestions(projects).suggestions;
                await selectAndRunSuggestedCommand(
                    suggestions,
                    () => vscode.workspace.isTrusted,
                    createCommandSelectionUi(),
                    { isAvailable: isAvailableDirectory },
                    createTerminalService(),
                    terminalLifecycleManager
                );
            } catch (error) {
                console.error('Terminal Blueprint command selection failed:', error);
                vscode.window.showErrorMessage(
                    'Terminal Blueprint: Unable to select a suggested command. Check the developer console for details.'
                );
            }
        }
    );

    const createBlueprint = vscode.commands.registerCommand(
        'terminal-blueprint.createBlueprint',
        async () => runBlueprintManagementAction(() => createBlueprintFromInputs(blueprintManagementService))
    );

    const manageBlueprints = vscode.commands.registerCommand(
        'terminal-blueprint.manageBlueprints',
        async () => runBlueprintManagementAction(() => manageBlueprintsFromInputs(blueprintManagementService))
    );

    // VS Code will clean these up when the extension stops.
    context.subscriptions.push(
        helloWorld,
        scanProject,
        runSuggestedCommand,
        createBlueprint,
        manageBlueprints,
        terminalLifecycleManager,
        output
    );
}

export function deactivate() {}

async function runBlueprintManagementAction(action: () => Promise<void>): Promise<void> {
    try {
        await action();
    } catch (error) {
        console.error('Terminal Blueprint blueprint management failed:', error);
        vscode.window.showErrorMessage('Terminal Blueprint: Unable to update local blueprints. Existing data was not changed.');
    }
}

function createCommandSelectionUi(): CommandSelectionUi {
    return {
        async pickSuggestion(items: readonly SuggestedCommandQuickPickItem[]) {
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a verified command suggestion to preview',
                matchOnDescription: true,
                matchOnDetail: true
            });
            return selected?.suggestion;
        },
        async requestApproval(preview: CommandPreview) {
            const choice = await vscode.window.showInformationMessage(
                preview.message,
                { modal: true },
                'Approve',
                'Cancel'
            );
            return choice === 'Approve';
        },
        showInformation(message: string) {
            void vscode.window.showInformationMessage(message);
        },
        showWarning(message: string) {
            void vscode.window.showWarningMessage(message);
        }
    };
}

async function isAvailableDirectory(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
        return false;
    }
}

function createTerminalService(): TerminalService {
    return {
        createTerminal(options) {
            return vscode.window.createTerminal({
                name: options.name,
                cwd: options.cwd
            });
        }
    };
}


import * as vscode from 'vscode';
import { formatScanOutput } from './output/scanOutputFormatter';
import { scanProjects } from './scanner/projectScanner';
import { generateCommandSuggestions } from './suggestions/commandSuggestionEngine';

export function activate(context: vscode.ExtensionContext) {

    console.log('Terminal Blueprint extension activated.');

    // Create one Output Channel for our extension.
    const output = vscode.window.createOutputChannel(
        'Terminal Blueprint'
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

    // VS Code will clean these up when the extension stops.
    context.subscriptions.push(
        helloWorld,
        scanProject,
        output
    );
}

export function deactivate() {}


import * as vscode from 'vscode';
import { getScriptInvocation } from './scanner/packageJsonScanner';
import { scanProjects } from './scanner/projectScanner';

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

                output.appendLine('================================');
                output.appendLine('      TERMINAL BLUEPRINT');
                output.appendLine('        PROJECT SCANNER');
                output.appendLine('================================');
                output.appendLine('');

                // Display all detected projects.
                for (const project of projects) {
                    output.appendLine(
                        `Project: ${project.name}`
                    );

                    output.appendLine(
                        `Detected: ${
                            project.technologies.join(', ') || 'Unknown'
                        }`
                    );

                    if (project.packageManager) {
                        const { candidates, isAmbiguous, name, source } = project.packageManager;
                        const packageManager = isAmbiguous
                            ? `Ambiguous (${candidates.join(', ')})`
                            : name ?? candidates.join(', ');
                        output.appendLine(
                            `Package manager: ${packageManager}${
                                source ? ` (${source})` : ''
                            }`
                        );
                    }

                    if (project.scripts.length > 0) {
                        output.appendLine('Available scripts:');
                        for (const script of project.scripts) {
                            const invocation = getScriptInvocation(
                                script.name,
                                project.packageManager
                            );
                            output.appendLine(
                                `  ${script.name}: ${invocation ?? 'Invocation unavailable'} ` +
                                `(${script.command})`
                            );
                        }
                    }

                    output.appendLine('--------------------------------');
                }

                output.appendLine('');
                output.appendLine('Scan completed. No commands executed.');

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

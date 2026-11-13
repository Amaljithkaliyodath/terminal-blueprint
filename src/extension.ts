import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const userVersion = vscode.version;

    console.log(
        `Terminal Blueprint activated on VS Code ${userVersion}`
    );

    const disposable = vscode.commands.registerCommand(
        'terminal-blueprint.helloWorld',
        () => {
            vscode.window.showInformationMessage(
                `Terminal Blueprint is running on VS Code ${userVersion}`
            );
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
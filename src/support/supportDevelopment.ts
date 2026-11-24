import * as vscode from 'vscode';

export const SUPPORT_DEVELOPMENT_URL = 'https://buymeacoffee.com/amaljithkab';

export interface ExternalUriOpener {
    openExternal(uri: vscode.Uri): Thenable<boolean>;
}

export async function openSupportDevelopment(
    opener: ExternalUriOpener = vscode.env,
    showWarning: (message: string) => void = (message) => { void vscode.window.showWarningMessage(message); }
): Promise<boolean> {
    try {
        const opened = await opener.openExternal(vscode.Uri.parse(SUPPORT_DEVELOPMENT_URL));
        if (!opened) {
            showWarning('Terminal Blueprint: Unable to open the support link.');
        }
        return opened;
    } catch {
        showWarning('Terminal Blueprint: Unable to open the support link.');
        return false;
    }
}

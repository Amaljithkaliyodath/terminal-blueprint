export interface ModalInformationPrompt {
    (message: string, options: { modal: true }, approve: string): Thenable<string | undefined>;
}

/**
 * VS Code modal dialogs already provide dismissal. Supplying a separate
 * "Cancel" action duplicates that UI on VS Code 1.85; only Approve is an
 * affirmative result and every dismissal remains a safe cancellation.
 */
export async function requestExplicitApproval(
    message: string,
    showInformationMessage: ModalInformationPrompt
): Promise<boolean> {
    return await showInformationMessage(message, { modal: true }, 'Approve') === 'Approve';
}

import * as vscode from 'vscode';
import { TerminalBlueprint, TerminalBlueprintCommand } from '../models/terminalBlueprint';
import { BlueprintManagementService, BlueprintCommandDraft } from './blueprintManagementService';

export async function createBlueprintFromInputs(service: BlueprintManagementService): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'Blueprint name', validateInput: requiredText });
    if (name === undefined) {
        return;
    }
    const command = await promptForCommand();
    if (!command) {
        return;
    }
    await service.create({ name, commands: [command] });
    vscode.window.showInformationMessage(`Terminal Blueprint: Created "${name}".`);
}

export async function manageBlueprintsFromInputs(service: BlueprintManagementService): Promise<void> {
    const blueprints = await service.list();
    if (blueprints.length === 0) {
        vscode.window.showInformationMessage('Terminal Blueprint: No saved blueprints yet.');
        return;
    }
    const selected = await vscode.window.showQuickPick(
        blueprints.map((blueprint) => ({ label: blueprint.name, description: `${blueprint.commands.length} command(s)`, blueprint })),
        { placeHolder: 'Select a blueprint to manage' }
    );
    if (!selected) {
        return;
    }
    await manageBlueprint(service, selected.blueprint);
}

async function manageBlueprint(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const action = await vscode.window.showQuickPick([
        { label: 'View details', value: 'view' },
        { label: 'Rename', value: 'rename' },
        { label: 'Edit description', value: 'description' },
        { label: 'Add command', value: 'add' },
        { label: 'Edit command', value: 'edit' },
        { label: 'Remove command', value: 'remove' },
        { label: 'Reorder command', value: 'reorder' },
        { label: 'Duplicate blueprint', value: 'duplicate' },
        { label: 'Delete blueprint', value: 'delete' }
    ], { placeHolder: `Manage ${blueprint.name}` });
    if (!action) {
        return;
    }

    switch (action.value) {
        case 'view':
            vscode.window.showInformationMessage(formatBlueprintDetails(blueprint), { modal: true });
            return;
        case 'rename':
            await renameBlueprint(service, blueprint);
            return;
        case 'description':
            await editDescription(service, blueprint);
            return;
        case 'add':
            await addCommand(service, blueprint);
            return;
        case 'edit':
            await editCommand(service, blueprint);
            return;
        case 'remove':
            await removeCommand(service, blueprint);
            return;
        case 'reorder':
            await reorderCommand(service, blueprint);
            return;
        case 'duplicate':
            await service.duplicate(blueprint.id);
            vscode.window.showInformationMessage(`Terminal Blueprint: Duplicated "${blueprint.name}".`);
            return;
        case 'delete':
            await deleteBlueprint(service, blueprint);
    }
}

async function renameBlueprint(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const name = await vscode.window.showInputBox({ value: blueprint.name, prompt: 'Blueprint name', validateInput: requiredText });
    if (name !== undefined) {
        await service.editMetadata(blueprint.id, { name, ...(blueprint.description === undefined ? {} : { description: blueprint.description }) });
    }
}

async function editDescription(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const description = await vscode.window.showInputBox({ value: blueprint.description ?? '', prompt: 'Optional blueprint description (leave blank to clear)' });
    if (description !== undefined) {
        await service.editMetadata(blueprint.id, { name: blueprint.name, ...(description.trim() === '' ? {} : { description }) });
    }
}

async function addCommand(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const command = await promptForCommand();
    if (command) {
        await service.addCommand(blueprint.id, command);
    }
}

async function editCommand(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const selected = await selectCommand(blueprint);
    if (!selected) {
        return;
    }
    const command = await promptForCommand(selected);
    if (command) {
        await service.editCommand(blueprint.id, selected.id, command);
    }
}

async function removeCommand(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    if (blueprint.commands.length === 1) {
        vscode.window.showWarningMessage('Terminal Blueprint: A blueprint must keep at least one command.');
        return;
    }
    const selected = await selectCommand(blueprint);
    if (selected) {
        await service.removeCommand(blueprint.id, selected.id);
    }
}

async function reorderCommand(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const selected = await selectCommand(blueprint);
    if (!selected) {
        return;
    }
    const direction = await vscode.window.showQuickPick([
        { label: 'Move up', value: 'up' as const },
        { label: 'Move down', value: 'down' as const }
    ], { placeHolder: 'Choose command movement' });
    if (direction) {
        await service.moveCommand(blueprint.id, selected.id, direction.value);
    }
}

async function deleteBlueprint(service: BlueprintManagementService, blueprint: TerminalBlueprint): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
        `Delete blueprint "${blueprint.name}"? This cannot be undone.`,
        { modal: true },
        'Delete'
    );
    if (choice === 'Delete') {
        await service.delete(blueprint.id);
        vscode.window.showInformationMessage(`Terminal Blueprint: Deleted "${blueprint.name}".`);
    }
}

async function selectCommand(blueprint: TerminalBlueprint): Promise<TerminalBlueprintCommand | undefined> {
    const selected = await vscode.window.showQuickPick(
        blueprint.commands.map((command, index) => ({ label: `${index + 1}. ${command.label}`, description: command.command, command })),
        { placeHolder: 'Select a command entry' }
    );
    return selected?.command;
}

async function promptForCommand(existing?: TerminalBlueprintCommand): Promise<BlueprintCommandDraft | undefined> {
    const label = await vscode.window.showInputBox({ value: existing?.label, prompt: 'Command label', validateInput: requiredText });
    if (label === undefined) {
        return undefined;
    }
    const command = await vscode.window.showInputBox({ value: existing?.command, prompt: 'Command text (stored only; not executed)', validateInput: requiredText });
    if (command === undefined) {
        return undefined;
    }
    const description = await vscode.window.showInputBox({ value: existing?.description ?? '', prompt: 'Optional command description (leave blank to clear)' });
    if (description === undefined) {
        return undefined;
    }
    const relativeWorkingDirectory = await vscode.window.showInputBox({ value: existing?.relativeWorkingDirectory ?? '', prompt: 'Optional relative working directory (leave blank for project root)' });
    if (relativeWorkingDirectory === undefined) {
        return undefined;
    }
    return {
        label,
        command,
        ...(description.trim() === '' ? {} : { description }),
        ...(relativeWorkingDirectory.trim() === '' ? {} : { relativeWorkingDirectory })
    };
}

function requiredText(value: string): string | undefined {
    return value.trim() === '' ? 'A value is required.' : undefined;
}

function formatBlueprintDetails(blueprint: TerminalBlueprint): string {
    const commands = blueprint.commands.map((command, index) => `${index + 1}. ${command.label}: ${command.command}`).join('\n');
    return `${blueprint.name}\n${blueprint.description ?? 'No description'}\n\nCommands:\n${commands}`;
}

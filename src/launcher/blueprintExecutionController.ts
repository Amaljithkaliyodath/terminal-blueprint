import * as vscode from 'vscode';
import { createBlueprintCompatibilityItems, createProjectCompatibilityItems } from '../compatibility/blueprintCompatibilityController';
import { BlueprintCompatibilityResult, CompatibilityFileSystem, evaluateBlueprintCompatibility } from '../compatibility/blueprintCompatibilityEngine';
import { TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';
import { generateCommandSuggestions } from '../suggestions/commandSuggestionEngine';
import { isSafeSuggestionForExecution, TerminalHandle, TerminalService } from './commandSelectionController';
import type { TerminalTracker } from './terminalLifecycleManager';

export interface BlueprintExecutionStorage { load(): Promise<TerminalBlueprintStorageDocument>; }
export interface BlueprintExecutionUi {
    pickBlueprint(items: ReturnType<typeof createBlueprintCompatibilityItems>): Promise<TerminalBlueprint | undefined>;
    pickProject(items: ReturnType<typeof createProjectCompatibilityItems>): Promise<ProjectInfo | undefined>;
    pickCommands(items: readonly BlueprintCommandItem[]): Promise<readonly string[] | undefined>;
    acknowledgeWarning(result: BlueprintCompatibilityResult): Promise<boolean>;
    confirmIncompatibleOverride(result: BlueprintCompatibilityResult): Promise<boolean>;
    requestApproval(preview: BlueprintExecutionPreview): Promise<boolean>;
    showWarning(message: string): void;
    showInformation(message: string): void;
}
export interface BlueprintCommandItem { commandId: string; label: string; description: string; detail: string; }
export interface BlueprintExecutionPreview { message: string; plans: readonly BlueprintExecutionPlan[]; }
export interface BlueprintExecutionPlan { commandId: string; command: string; workingDirectory: vscode.Uri; projectName: string; }
export type BlueprintExecutionResult =
    | 'executed' | 'cancelled' | 'no-blueprints' | 'no-projects' | 'no-authorized-commands'
    | 'untrusted-workspace' | 'incompatible' | 'working-directory-unavailable' | 'terminal-creation-failed';

export async function selectAndRunBlueprint(
    storage: BlueprintExecutionStorage,
    scan: () => Promise<ProjectInfo[]>,
    isWorkspaceTrusted: () => boolean,
    ui: BlueprintExecutionUi,
    fileSystem: CompatibilityFileSystem,
    terminalService: TerminalService,
    terminalTracker: TerminalTracker,
    onCompatibility: (blueprint: TerminalBlueprint, project: ProjectInfo, result: BlueprintCompatibilityResult) => void
): Promise<BlueprintExecutionResult> {
    const document = await storage.load();
    if (document.blueprints.length === 0) { ui.showInformation('Terminal Blueprint: No saved blueprints are available.'); return 'no-blueprints'; }
    const blueprint = await ui.pickBlueprint(createBlueprintCompatibilityItems(document.blueprints));
    if (!blueprint) { return 'cancelled'; }
    const projects = await scan();
    if (projects.length === 0) { ui.showWarning('Terminal Blueprint: Please open a project folder before running a blueprint.'); return 'no-projects'; }
    const project = projects.length === 1 ? projects[0] : await ui.pickProject(createProjectCompatibilityItems(projects));
    if (!project) { return 'cancelled'; }
    const compatibility = await evaluateBlueprintCompatibility(blueprint, project, fileSystem);
    onCompatibility(blueprint, project, compatibility);
    if (compatibility.commandWorkingDirectories.some((finding) => finding.status !== 'AVAILABLE')) {
        ui.showWarning('Terminal Blueprint: Blueprint command working directories are missing, unsafe, or unavailable. Execution was blocked.');
        return 'working-directory-unavailable';
    }
    if (compatibility.status === 'WARNING' && !await ui.acknowledgeWarning(compatibility)) { return 'cancelled'; }
    if (compatibility.status === 'INCOMPATIBLE' && !await ui.confirmIncompatibleOverride(compatibility)) { return 'incompatible'; }
    if (!isWorkspaceTrusted()) { ui.showWarning('Terminal Blueprint: Blueprint execution is unavailable in an untrusted workspace.'); return 'untrusted-workspace'; }

    const candidates = authorizedCommands(blueprint, project);
    const unsupportedCount = blueprint.commands.length - candidates.length;
    if (unsupportedCount > 0) { ui.showWarning(`Terminal Blueprint: ${unsupportedCount} blueprint command(s) are unsupported and cannot be executed.`); }
    if (candidates.length === 0) { return 'no-authorized-commands'; }
    const selectedIds = await ui.pickCommands(candidates.map(toItem));
    if (!selectedIds || selectedIds.length === 0) { return 'cancelled'; }
    const plans = createPlans(candidates, selectedIds, project);
    if (plans.length === 0) { return 'cancelled'; }
    const preview = createPreview(blueprint, project, compatibility, plans);
    if (!await ui.requestApproval(preview)) { return 'cancelled'; }

    if (!isWorkspaceTrusted()) { ui.showWarning('Terminal Blueprint: Blueprint execution is unavailable in an untrusted workspace.'); return 'untrusted-workspace'; }
    const currentCompatibility = await evaluateBlueprintCompatibility(blueprint, project, fileSystem);
    if (plans.some((plan) => !isStillAvailable(plan, currentCompatibility))) {
        ui.showWarning('Terminal Blueprint: A selected working directory changed or is no longer safe. Execution was blocked.');
        return 'working-directory-unavailable';
    }
    try {
        for (const plan of plans) {
            const name = terminalTracker.createTerminalName(plan.projectName, plan.command);
            const terminal = terminalService.createTerminal({ name, cwd: plan.workingDirectory });
            terminalTracker.track(terminal, name, plan.command, plan.workingDirectory);
            terminal.sendText(plan.command, true);
            terminal.show(false);
        }
        return 'executed';
    } catch {
        ui.showWarning('Terminal Blueprint: Unable to create a terminal for the approved blueprint command.');
        return 'terminal-creation-failed';
    }
}

interface AuthorizedBlueprintCommand { id: string; label: string; command: string; source: string; reason: string; }

function authorizedCommands(blueprint: TerminalBlueprint, project: ProjectInfo): AuthorizedBlueprintCommand[] {
    const suggestions = generateCommandSuggestions([project]).suggestions.filter(isSafeSuggestionForExecution);
    return blueprint.commands.flatMap((entry) => {
        if (entry.relativeWorkingDirectory && entry.relativeWorkingDirectory !== '.') { return []; }
        const suggestion = suggestions.find((candidate) => candidate.command === entry.command);
        return suggestion ? [{ id: entry.id, label: entry.label, command: suggestion.command, source: suggestion.source, reason: suggestion.reason }] : [];
    });
}

function toItem(command: AuthorizedBlueprintCommand): BlueprintCommandItem {
    return { commandId: command.id, label: command.label, description: command.command, detail: `${command.source}: ${command.reason}` };
}

function createPlans(commands: readonly AuthorizedBlueprintCommand[], selectedIds: readonly string[], project: ProjectInfo): readonly BlueprintExecutionPlan[] {
    const selected = new Set(selectedIds);
    return Object.freeze(commands.filter((command) => selected.has(command.id)).map((command) => Object.freeze({
        commandId: command.id, command: command.command, workingDirectory: project.workingDirectory, projectName: project.name
    })));
}

function createPreview(blueprint: TerminalBlueprint, project: ProjectInfo, compatibility: BlueprintCompatibilityResult, plans: readonly BlueprintExecutionPlan[]): BlueprintExecutionPreview {
    return { plans, message: [
        'Review blueprint commands before approving:', `Blueprint: ${blueprint.name}`, `Project: ${project.name} (${project.relativePath})`,
        `Compatibility: ${compatibility.status}`, ...compatibility.warnings.map((warning) => `Warning: ${warning.message}`),
        ...plans.flatMap((plan, index) => [`${index + 1}. Command: ${plan.command}`, `   Working directory: ${plan.workingDirectory.toString()}`]),
        'Only independently authorized commands can run.'
    ].join('\n') };
}

function isStillAvailable(plan: BlueprintExecutionPlan, compatibility: BlueprintCompatibilityResult): boolean {
    const finding = compatibility.commandWorkingDirectories.find((candidate) => candidate.commandId === plan.commandId);
    return finding?.status === 'AVAILABLE' && finding.workingDirectory?.toString() === plan.workingDirectory.toString();
}

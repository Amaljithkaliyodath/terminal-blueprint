import * as vscode from 'vscode';
import { TerminalBlueprint, TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';
import {
    BlueprintCompatibilityResult,
    CompatibilityFileSystem,
    evaluateBlueprintCompatibility
} from './blueprintCompatibilityEngine';

export interface BlueprintCompatibilityStorage {
    load(): Promise<TerminalBlueprintStorageDocument>;
}

export interface BlueprintCompatibilityQuickPickItem {
    label: string;
    description: string;
    detail: string;
}

export interface BlueprintCompatibilityUi {
    pickBlueprint(items: readonly (BlueprintCompatibilityQuickPickItem & { blueprint: TerminalBlueprint })[]): Promise<TerminalBlueprint | undefined>;
    pickProject(items: readonly (BlueprintCompatibilityQuickPickItem & { project: ProjectInfo })[]): Promise<ProjectInfo | undefined>;
}

export type BlueprintCompatibilityInspectionResult =
    | { outcome: 'displayed'; blueprint: TerminalBlueprint; project: ProjectInfo; compatibility: BlueprintCompatibilityResult }
    | { outcome: 'cancelled' | 'no-blueprints' | 'no-projects' };

export function createBlueprintCompatibilityItems(blueprints: readonly TerminalBlueprint[]): Array<BlueprintCompatibilityQuickPickItem & { blueprint: TerminalBlueprint }> {
    return [...blueprints].sort((left, right) => left.id.localeCompare(right.id)).map((blueprint) => ({
        label: blueprint.name,
        description: `ID: ${blueprint.id}`,
        detail: `${blueprint.commands.length} command${blueprint.commands.length === 1 ? '' : 's'}`,
        blueprint
    }));
}

export function createProjectCompatibilityItems(projects: readonly ProjectInfo[]): Array<BlueprintCompatibilityQuickPickItem & { project: ProjectInfo }> {
    return [...projects].sort(compareProjects).map((project) => ({
        label: `${project.name} (${project.relativePath})`,
        description: project.workingDirectory.toString(),
        detail: project.technologies.join(', ') || 'No verified technologies',
        project
    }));
}

export async function inspectBlueprintCompatibility(
    storage: BlueprintCompatibilityStorage,
    scan: () => Promise<ProjectInfo[]>,
    ui: BlueprintCompatibilityUi,
    fileSystem: CompatibilityFileSystem
): Promise<BlueprintCompatibilityInspectionResult> {
    const document = await storage.load();
    if (document.blueprints.length === 0) { return { outcome: 'no-blueprints' }; }
    const projects = await scan();
    if (projects.length === 0) { return { outcome: 'no-projects' }; }
    const blueprint = await ui.pickBlueprint(createBlueprintCompatibilityItems(document.blueprints));
    if (!blueprint) { return { outcome: 'cancelled' }; }
    const project = projects.length === 1
        ? projects[0]
        : await ui.pickProject(createProjectCompatibilityItems(projects));
    if (!project) { return { outcome: 'cancelled' }; }
    return {
        outcome: 'displayed',
        blueprint,
        project,
        compatibility: await evaluateBlueprintCompatibility(blueprint, project, fileSystem)
    };
}

function compareProjects(left: ProjectInfo, right: ProjectInfo): number {
    return left.workingDirectory.toString().localeCompare(right.workingDirectory.toString()) ||
        left.relativePath.localeCompare(right.relativePath) || left.name.localeCompare(right.name);
}

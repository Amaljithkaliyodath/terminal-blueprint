import * as vscode from 'vscode';
import { CommandSuggestion, CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';
import { TerminalBlueprint } from '../models/terminalBlueprint';
import { BlueprintCompatibilityResult } from '../compatibility/blueprintCompatibilityEngine';

type SidebarCategory = 'projects' | 'commands' | 'blueprints';
type LoadState = 'unloaded' | 'loaded' | 'error';
interface CategoryDefinition { category: SidebarCategory; label: string; tooltip: string; icon: string; }
const categories: readonly CategoryDefinition[] = [
    { category: 'projects', label: 'Detected Projects', tooltip: 'Detected projects in the current workspace.', icon: 'folder-library' },
    { category: 'commands', label: 'Suggested Commands', tooltip: 'Metadata-backed command suggestions for detected projects.', icon: 'terminal' },
    { category: 'blueprints', label: 'Saved Blueprints', tooltip: 'Saved blueprints will appear here in a future update.', icon: 'bookmark' }
];

export interface SidebarBlueprint { blueprint: TerminalBlueprint; compatibility?: BlueprintCompatibilityResult; compatibilityMessage?: string; }
export interface SidebarData { state: LoadState; projects: readonly ProjectInfo[]; suggestionResult: CommandSuggestionResult; blueprints: readonly SidebarBlueprint[]; blueprintState: LoadState; errorMessage?: string; blueprintErrorMessage?: string; }
const unloadedData: SidebarData = { state: 'unloaded', projects: [], suggestionResult: { suggestions: [], warnings: [] }, blueprints: [], blueprintState: 'unloaded' };

export class TerminalBlueprintTreeItem extends vscode.TreeItem {
    public constructor(public readonly itemId: string, label: string, collapsibleState: vscode.TreeItemCollapsibleState, tooltip: string, icon?: string) {
        super(label, collapsibleState);
        this.id = itemId; this.tooltip = tooltip; this.contextValue = itemId;
        this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
        this.accessibilityInformation = { label: `${label}. ${tooltip}` };
    }
}

export class TerminalBlueprintTreeProvider implements vscode.TreeDataProvider<TerminalBlueprintTreeItem>, vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<TerminalBlueprintTreeItem | undefined>();
    private data: SidebarData = unloadedData;
    public readonly onDidChangeTreeData = this.changeEmitter.event;
    public getTreeItem(element: TerminalBlueprintTreeItem): vscode.TreeItem { return element; }

    public getChildren(element?: TerminalBlueprintTreeItem): TerminalBlueprintTreeItem[] {
        if (!element) { return categories.map((category) => categoryItem(category)); }
        if (element.itemId === 'terminal-blueprint.category.projects') { return this.projectChildren(); }
        if (element.itemId === 'terminal-blueprint.category.commands') { return this.commandProjectChildren(); }
        if (element.itemId === 'terminal-blueprint.category.blueprints') { return this.blueprintChildren(); }
        if (element.itemId.startsWith('terminal-blueprint.commands-project.')) { return this.commandChildren(element.itemId.slice('terminal-blueprint.commands-project.'.length)); }
        if (element.itemId.startsWith('terminal-blueprint.blueprint.')) { return this.blueprintDetailChildren(element.itemId.slice('terminal-blueprint.blueprint.'.length)); }
        return [];
    }

    public setData(data: SidebarData): void { this.data = data; this.refresh(); }
    public refresh(): void { this.changeEmitter.fire(undefined); }
    public dispose(): void { this.changeEmitter.dispose(); }

    private projectChildren(): TerminalBlueprintTreeItem[] {
        if (this.data.state === 'error') { return [errorItem('projects', this.data.errorMessage)]; }
        if (this.data.projects.length === 0) { return [emptyItem('projects', this.data.state === 'unloaded' ? 'No projects loaded' : 'No projects detected', 'Use Refresh to load workspace project metadata.')]; }
        return sortedProjects(this.data.projects).map((project) => projectItem(project));
    }

    private commandProjectChildren(): TerminalBlueprintTreeItem[] {
        if (this.data.state === 'error') { return [errorItem('commands', 'Suggestions unavailable until project scanning succeeds.')]; }
        const projects = sortedProjects(this.data.projects).filter((project) => this.suggestionsFor(project).length > 0);
        if (projects.length === 0) { return [emptyItem('commands', this.data.state === 'unloaded' ? 'No commands loaded' : 'No suggested commands', 'Only verified metadata-backed commands are shown.')]; }
        return projects.map((project) => new TerminalBlueprintTreeItem(`terminal-blueprint.commands-project.${projectKey(project)}`, `${project.name} (${project.relativePath})`, vscode.TreeItemCollapsibleState.Expanded, `Suggested commands for ${project.name}. Working directory: ${displayUri(project.workingDirectory)}.`, 'folder'));
    }

    private commandChildren(key: string): TerminalBlueprintTreeItem[] {
        const project = this.data.projects.find((candidate) => projectKey(candidate) === key);
        return project ? this.suggestionsFor(project).map((suggestion) => commandItem(suggestion)) : [];
    }

    private blueprintChildren(): TerminalBlueprintTreeItem[] {
        if (this.data.blueprintState === 'error') { return [errorItem('blueprints', this.data.blueprintErrorMessage ?? 'Unable to load saved blueprints.')]; }
        if (this.data.blueprints.length === 0) { return [emptyItem('blueprints', this.data.blueprintState === 'unloaded' ? 'No blueprints loaded' : 'No saved blueprints', 'Create or import blueprints to display them here.')]; }
        return this.data.blueprints.map(({ blueprint, compatibility, compatibilityMessage }) => {
            const hint = [blueprint.technologyHints?.join(', '), blueprint.packageManagerHint].filter(Boolean).join(' · ') || 'No compatibility hints';
            const item = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint.${blueprint.id}`, blueprint.name, vscode.TreeItemCollapsibleState.Expanded, `${blueprint.description ?? 'No description.'}\n${blueprint.commands.length} saved command(s)\nHints: ${hint}\n${compatibility ? `Compatibility: ${compatibility.status}` : compatibilityMessage ?? 'Compatibility not evaluated.'}`, 'bookmark');
            item.description = `${blueprint.commands.length} command${blueprint.commands.length === 1 ? '' : 's'} · ${compatibility ? compatibility.status : 'Not evaluated'}`;
            return item;
        });
    }

    private blueprintDetailChildren(id: string): TerminalBlueprintTreeItem[] {
        const data = this.data.blueprints.find((candidate) => candidate.blueprint.id === id);
        if (!data) { return []; }
        const compatibility = data.compatibility;
        const compatibilityItem = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint-compatibility.${id}`, compatibility ? `Compatibility: ${compatibility.status}` : 'Compatibility: Not evaluated', vscode.TreeItemCollapsibleState.None, compatibility ? compatibility.reasons.join('\n') || 'No compatibility reasons were reported.' : data.compatibilityMessage ?? 'Select a project with the compatibility command to evaluate this blueprint.', compatibility ? compatibilityIcon(compatibility.status) : 'question');
        const commands = data.blueprint.commands.map((command) => {
            const item = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint-command.${id}.${command.id}`, command.label, vscode.TreeItemCollapsibleState.None, `${command.description ?? 'Saved blueprint command.'}\nWorking directory: ${command.relativeWorkingDirectory ?? '.'}\nCommand text is stored data and is not executable from the sidebar.`, 'terminal');
            item.description = command.relativeWorkingDirectory ?? '.';
            return item;
        });
        return [compatibilityItem, ...commands];
    }

    private suggestionsFor(project: ProjectInfo): CommandSuggestion[] {
        return this.data.suggestionResult.suggestions.filter((suggestion) => suggestion.project.workingDirectory.toString() === project.workingDirectory.toString()).sort((left, right) => left.id.localeCompare(right.id));
    }
}

function categoryItem(category: CategoryDefinition): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.category.${category.category}`, category.label, vscode.TreeItemCollapsibleState.Expanded, category.tooltip, category.icon); }
function emptyItem(category: SidebarCategory, label: string, tooltip: string): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.empty.${category}`, label, vscode.TreeItemCollapsibleState.None, tooltip); }
function errorItem(category: SidebarCategory, message = 'Unable to load sidebar data.'): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.error.${category}`, 'Unable to load data', vscode.TreeItemCollapsibleState.None, message, 'warning'); }
function projectItem(project: ProjectInfo): TerminalBlueprintTreeItem {
    const technology = project.technologies.join(', ') || 'No verified technologies';
    const packageManager = project.packageManager?.isAmbiguous ? `Ambiguous package managers: ${project.packageManager.candidates.join(', ')}` : project.packageManager?.name ? `Package manager: ${project.packageManager.name}` : 'No verified package manager';
    const item = new TerminalBlueprintTreeItem(`terminal-blueprint.project.${projectKey(project)}`, project.name, vscode.TreeItemCollapsibleState.None, `${project.relativePath}\n${technology}\n${packageManager}\nWorking directory: ${displayUri(project.workingDirectory)}`, 'project');
    item.description = `${project.relativePath} · ${technology}`;
    return item;
}
function commandItem(suggestion: CommandSuggestion): TerminalBlueprintTreeItem {
    const item = new TerminalBlueprintTreeItem(`terminal-blueprint.command.${suggestion.id}`, suggestion.title, vscode.TreeItemCollapsibleState.None, `${suggestion.description}\nCommand: ${suggestion.command}\nWorking directory: ${displayUri(suggestion.workingDirectory)}\n${suggestion.reason}`, 'terminal');
    item.description = suggestion.command;
    return item;
}
function projectKey(project: ProjectInfo): string { return encodeURIComponent(project.workingDirectory.toString()); }
function sortedProjects(projects: readonly ProjectInfo[]): ProjectInfo[] { return [...projects].sort((left, right) => projectKey(left).localeCompare(projectKey(right))); }
function displayUri(uri: vscode.Uri): string { return uri.fsPath || uri.toString(); }
function compatibilityIcon(status: BlueprintCompatibilityResult['status']): string { return status === 'COMPATIBLE' ? 'pass' : status === 'WARNING' ? 'warning' : 'error'; }

import * as vscode from 'vscode';
import { CommandSuggestion, CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';
import { TerminalBlueprint } from '../models/terminalBlueprint';
import { BlueprintCompatibilityResult } from '../compatibility/blueprintCompatibilityEngine';

type SidebarCategory = 'projects' | 'blueprints' | 'support';
type LoadState = 'unloaded' | 'loaded' | 'error';
interface CategoryDefinition { category: SidebarCategory; label: string; tooltip: string; icon: string; }
const categories: readonly CategoryDefinition[] = [
    { category: 'projects', label: 'Detected Projects', tooltip: 'Verified projects and their metadata-backed command suggestions.', icon: 'folder-library' },
    { category: 'blueprints', label: 'Saved Blueprints', tooltip: 'Local blueprints. Use Check Blueprint Compatibility for full compatibility details.', icon: 'bookmark' },
    { category: 'support', label: 'Support & About', tooltip: 'Optional Terminal Blueprint support and information.', icon: 'info' }
];

export interface SidebarBlueprint { blueprint: TerminalBlueprint; compatibility?: BlueprintCompatibilityResult; compatibilityMessage?: string; }
export interface SidebarData { state: LoadState; projects: readonly ProjectInfo[]; suggestionResult: CommandSuggestionResult; blueprints: readonly SidebarBlueprint[]; blueprintState: LoadState; errorMessage?: string; blueprintErrorMessage?: string; }
const unloadedData: SidebarData = { state: 'unloaded', projects: [], suggestionResult: { suggestions: [], warnings: [] }, blueprints: [], blueprintState: 'unloaded' };

export class TerminalBlueprintTreeItem extends vscode.TreeItem {
    public constructor(public readonly itemId: string, label: string, collapsibleState: vscode.TreeItemCollapsibleState, tooltip: string, icon?: string | vscode.ThemeIcon, contextValue = itemId) {
        super(label, collapsibleState);
        this.id = itemId; this.tooltip = tooltip; this.contextValue = contextValue;
        this.iconPath = typeof icon === 'string' ? new vscode.ThemeIcon(icon) : icon;
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
        if (element.itemId === 'terminal-blueprint.category.blueprints') { return this.blueprintChildren(); }
        if (element.itemId === 'terminal-blueprint.category.support') { return this.supportChildren(); }
        if (element.itemId.startsWith('terminal-blueprint.project.')) { return this.commandChildren(element.itemId.slice('terminal-blueprint.project.'.length)); }
        if (element.itemId.startsWith('terminal-blueprint.blueprint.')) { return this.blueprintDetailChildren(element.itemId.slice('terminal-blueprint.blueprint.'.length)); }
        return [];
    }

    public setData(data: SidebarData): void { this.data = data; this.refresh(); }
    public refresh(): void { this.changeEmitter.fire(undefined); }
    public dispose(): void { this.changeEmitter.dispose(); }

    private projectChildren(): TerminalBlueprintTreeItem[] {
        if (this.data.state === 'error') { return [errorItem('projects', this.data.errorMessage)]; }
        if (this.data.projects.length === 0) { return [emptyItem('projects', this.data.state === 'unloaded' ? 'No projects loaded' : 'No projects detected', 'Run Scan Project or use Refresh to discover workspace projects.')]; }
        return sortedProjects(this.data.projects).map((project) => projectItem(project, this.suggestionsFor(project)));
    }

    private commandChildren(key: string): TerminalBlueprintTreeItem[] {
        const project = this.data.projects.find((candidate) => projectKey(candidate) === key);
        return project ? this.suggestionsFor(project).map((suggestion) => commandItem(suggestion)) : [];
    }

    private blueprintChildren(): TerminalBlueprintTreeItem[] {
        if (this.data.blueprintState === 'error') { return [errorItem('blueprints', this.data.blueprintErrorMessage ?? 'Unable to load saved blueprints.')]; }
        if (this.data.blueprints.length === 0) { return [emptyItem('blueprints', this.data.blueprintState === 'unloaded' ? 'No blueprints loaded' : 'No saved blueprints', 'Use Create Blueprint or Import Blueprints to add local saved commands.')]; }
        return this.data.blueprints.map(({ blueprint, compatibility }) => {
            const compatibilitySummary = compatibility ? compatibility.status : 'Not evaluated';
            const item = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint.${blueprint.id}`, blueprint.name, vscode.TreeItemCollapsibleState.Expanded, `${blueprint.description ?? 'No description.'}\n${blueprint.commands.length} saved command(s)\nCompatibility: ${compatibilitySummary}\nUse Check Blueprint Compatibility for detailed findings.`, 'bookmark', 'terminal-blueprint.blueprint');
            item.description = `${blueprint.commands.length} command${blueprint.commands.length === 1 ? '' : 's'} · ${compatibilitySummary}`;
            return item;
        });
    }

    private supportChildren(): TerminalBlueprintTreeItem[] {
        const item = new TerminalBlueprintTreeItem(
            'terminal-blueprint.support-development',
            'Buy Me a Coffee',
            vscode.TreeItemCollapsibleState.None,
            'Optionally support Terminal Blueprint development. Opens Buy Me a Coffee in your external browser.',
            'heart',
            'terminal-blueprint.support-development'
        );
        item.description = 'Optional support';
        item.command = { command: 'terminal-blueprint.supportDevelopment', title: 'Terminal Blueprint: Support Development' };
        return [item];
    }

    private blueprintDetailChildren(id: string): TerminalBlueprintTreeItem[] {
        const data = this.data.blueprints.find((candidate) => candidate.blueprint.id === id);
        if (!data) { return []; }
        const compatibility = data.compatibility;
        const compatibilityItem = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint-compatibility.${id}`, compatibility ? `Compatibility: ${compatibility.status}` : 'Compatibility: Not evaluated', vscode.TreeItemCollapsibleState.None, compatibility ? 'Use Check Blueprint Compatibility for detailed findings.' : data.compatibilityMessage ?? 'Select a project with the compatibility command to evaluate this blueprint.', compatibility ? compatibilityIcon(compatibility.status) : 'question', 'terminal-blueprint.blueprint-compatibility');
        const commands = data.blueprint.commands.map((command) => {
            const item = new TerminalBlueprintTreeItem(`terminal-blueprint.blueprint-command.${id}.${command.id}`, command.label, vscode.TreeItemCollapsibleState.None, `${command.description ?? 'Saved blueprint command.'}\nCommand: ${command.command}\nWorking directory: ${command.relativeWorkingDirectory ?? '.'}\nCommand text is stored data and is not executable from the sidebar.`, 'terminal', 'terminal-blueprint.blueprint-command');
            item.description = command.relativeWorkingDirectory ?? '.';
            return item;
        });
        return [compatibilityItem, ...commands];
    }

    private suggestionsFor(project: ProjectInfo): CommandSuggestion[] {
        return this.data.suggestionResult.suggestions.filter((suggestion) => suggestion.project.workingDirectory.toString() === project.workingDirectory.toString()).sort((left, right) => left.id.localeCompare(right.id));
    }
}

function categoryItem(category: CategoryDefinition): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.category.${category.category}`, category.label, vscode.TreeItemCollapsibleState.Expanded, category.tooltip, category.icon, `terminal-blueprint.category.${category.category}`); }
function emptyItem(category: SidebarCategory, label: string, tooltip: string): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.empty.${category}`, label, vscode.TreeItemCollapsibleState.None, tooltip); }
function errorItem(category: SidebarCategory, message = 'Unable to load sidebar data.'): TerminalBlueprintTreeItem { return new TerminalBlueprintTreeItem(`terminal-blueprint.error.${category}`, 'Unable to load data', vscode.TreeItemCollapsibleState.None, message, 'warning'); }
function projectItem(project: ProjectInfo, suggestions: readonly CommandSuggestion[]): TerminalBlueprintTreeItem {
    const technology = project.technologies.join(', ') || 'No verified technologies';
    const packageManager = project.packageManager?.isAmbiguous ? `Ambiguous package managers: ${project.packageManager.candidates.join(', ')}` : project.packageManager?.name ? `Package manager: ${project.packageManager.name}` : 'No verified package manager';
    const item = new TerminalBlueprintTreeItem(`terminal-blueprint.project.${projectKey(project)}`, project.name, suggestions.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None, `Project: ${project.name}\nRelative path: ${project.relativePath}\nTechnologies: ${technology}\n${packageManager}\nWorking directory: ${displayUri(project.workingDirectory)}\nVerified suggestions: ${suggestions.length}`, 'project', 'terminal-blueprint.project');
    item.description = `${project.relativePath} · ${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`;
    return item;
}
function commandItem(suggestion: CommandSuggestion): TerminalBlueprintTreeItem {
    const item = new TerminalBlueprintTreeItem(`terminal-blueprint.command.${suggestion.id}`, suggestion.title, vscode.TreeItemCollapsibleState.None, `${suggestion.description}\nCommand: ${suggestion.command}\nWorking directory: ${displayUri(suggestion.workingDirectory)}\n${suggestion.reason}\nUse Run Suggested Command to preview and approve execution.`, 'terminal', 'terminal-blueprint.suggestion');
    item.description = suggestion.command;
    return item;
}
function projectKey(project: ProjectInfo): string { return encodeURIComponent(project.workingDirectory.toString()); }
function sortedProjects(projects: readonly ProjectInfo[]): ProjectInfo[] { return [...projects].sort((left, right) => projectKey(left).localeCompare(projectKey(right))); }
function displayUri(uri: vscode.Uri): string { return uri.fsPath || uri.toString(); }
function compatibilityIcon(status: BlueprintCompatibilityResult['status']): vscode.ThemeIcon {
    if (status === 'COMPATIBLE') { return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed')); }
    if (status === 'WARNING') { return new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground')); }
    return new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'));
}

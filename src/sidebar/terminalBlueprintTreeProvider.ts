import * as vscode from 'vscode';
import { CommandSuggestion, CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';

type SidebarCategory = 'projects' | 'commands' | 'blueprints';
type LoadState = 'unloaded' | 'loaded' | 'error';
interface CategoryDefinition { category: SidebarCategory; label: string; tooltip: string; icon: string; }
const categories: readonly CategoryDefinition[] = [
    { category: 'projects', label: 'Detected Projects', tooltip: 'Detected projects in the current workspace.', icon: 'folder-library' },
    { category: 'commands', label: 'Suggested Commands', tooltip: 'Metadata-backed command suggestions for detected projects.', icon: 'terminal' },
    { category: 'blueprints', label: 'Saved Blueprints', tooltip: 'Saved blueprints will appear here in a future update.', icon: 'bookmark' }
];

export interface SidebarData { state: LoadState; projects: readonly ProjectInfo[]; suggestionResult: CommandSuggestionResult; errorMessage?: string; }
const unloadedData: SidebarData = { state: 'unloaded', projects: [], suggestionResult: { suggestions: [], warnings: [] } };

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
        if (element.itemId === 'terminal-blueprint.category.blueprints') { return [emptyItem('blueprints', 'No blueprints loaded', 'Saved blueprints are not loaded into the sidebar yet.')]; }
        if (element.itemId.startsWith('terminal-blueprint.commands-project.')) { return this.commandChildren(element.itemId.slice('terminal-blueprint.commands-project.'.length)); }
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

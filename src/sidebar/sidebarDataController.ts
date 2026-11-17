import * as vscode from 'vscode';
import { CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';
import { SidebarData, TerminalBlueprintTreeProvider } from './terminalBlueprintTreeProvider';

export interface SidebarDataSource { scanProjects(): Promise<ProjectInfo[]>; generateSuggestions(projects: readonly ProjectInfo[]): CommandSuggestionResult; }

export class SidebarDataController implements vscode.Disposable {
    private activeRefresh: Promise<void> | undefined;
    private refreshQueued = false;
    private disposed = false;
    private generation = 0;
    public constructor(private readonly provider: TerminalBlueprintTreeProvider, private readonly source: SidebarDataSource) {}
    public refresh(): Promise<void> {
        if (this.disposed) { return Promise.resolve(); }
        if (this.activeRefresh) { this.refreshQueued = true; return this.activeRefresh; }
        const generation = ++this.generation;
        const operation = this.load(generation);
        this.activeRefresh = operation;
        void operation.finally(() => {
            if (this.activeRefresh !== operation) { return; }
            this.activeRefresh = undefined;
            if (this.refreshQueued && !this.disposed) { this.refreshQueued = false; void this.refresh(); }
        });
        return operation;
    }
    public invalidate(): void { this.generation += 1; if (!this.disposed) { this.provider.setData(emptyData('unloaded')); } }
    public dispose(): void { this.disposed = true; this.generation += 1; }
    private async load(generation: number): Promise<void> {
        try {
            const projects = await this.source.scanProjects();
            const suggestionResult = this.source.generateSuggestions(projects);
            if (!this.disposed && generation === this.generation) { this.provider.setData({ state: 'loaded', projects, suggestionResult }); }
        } catch {
            if (!this.disposed && generation === this.generation) { this.provider.setData({ ...emptyData('error'), errorMessage: 'Unable to scan workspace projects. Refresh the sidebar to try again.' }); }
        }
    }
}
function emptyData(state: SidebarData['state']): SidebarData { return { state, projects: [], suggestionResult: { suggestions: [], warnings: [] } }; }

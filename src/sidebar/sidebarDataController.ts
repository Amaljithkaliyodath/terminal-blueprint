import * as vscode from 'vscode';
import { CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';
import { SidebarBlueprint, SidebarData, TerminalBlueprintTreeProvider } from './terminalBlueprintTreeProvider';
import { TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import { CompatibilityFileSystem, evaluateBlueprintCompatibility } from '../compatibility/blueprintCompatibilityEngine';

export interface SidebarDataSource { scanProjects(): Promise<ProjectInfo[]>; generateSuggestions(projects: readonly ProjectInfo[]): CommandSuggestionResult; loadBlueprints(): Promise<TerminalBlueprintStorageDocument>; fileSystem: CompatibilityFileSystem; }

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
        const [projectsResult, blueprintsResult] = await Promise.allSettled([this.source.scanProjects(), this.source.loadBlueprints()]);
        if (this.disposed || generation !== this.generation) { return; }
        if (projectsResult.status !== 'fulfilled') {
            this.provider.setData({ ...emptyData('error'), errorMessage: 'Unable to scan workspace projects. Refresh the sidebar to try again.', blueprintState: blueprintsResult.status === 'fulfilled' ? 'loaded' : 'error', blueprints: blueprintsResult.status === 'fulfilled' ? blueprintsResult.value.blueprints.map((blueprint) => ({ blueprint, compatibilityMessage: 'Compatibility cannot be evaluated because project scanning failed.' })) : [], blueprintErrorMessage: 'Unable to load saved blueprints. Existing storage was not changed.' });
            return;
        }
        let suggestionResult: CommandSuggestionResult;
        try { suggestionResult = this.source.generateSuggestions(projectsResult.value); }
        catch {
            const blueprints = blueprintsResult.status === 'fulfilled' ? await this.evaluateBlueprints(blueprintsResult.value, projectsResult.value) : [];
            if (!this.disposed && generation === this.generation) {
                this.provider.setData({ ...emptyData('error'), errorMessage: 'Unable to generate command suggestions. Refresh the sidebar to try again.', blueprints, blueprintState: blueprintsResult.status === 'fulfilled' ? 'loaded' : 'error', ...(blueprintsResult.status === 'fulfilled' ? {} : { blueprintErrorMessage: 'Unable to load saved blueprints. Existing storage was not changed.' }) });
            }
            return;
        }
        const blueprints: SidebarBlueprint[] = blueprintsResult.status === 'fulfilled'
            ? await this.evaluateBlueprints(blueprintsResult.value, projectsResult.value)
            : [];
        if (!this.disposed && generation === this.generation) {
            this.provider.setData({ state: 'loaded', projects: projectsResult.value, suggestionResult, blueprints, blueprintState: blueprintsResult.status === 'fulfilled' ? 'loaded' : 'error', ...(blueprintsResult.status === 'fulfilled' ? {} : { blueprintErrorMessage: 'Unable to load saved blueprints. Existing storage was not changed.' }) });
        }
    }

    private async evaluateBlueprints(document: TerminalBlueprintStorageDocument, projects: readonly ProjectInfo[]): Promise<SidebarBlueprint[]> {
        if (projects.length !== 1) {
            const message = projects.length === 0 ? 'Compatibility not evaluated because no detected project is available.' : 'Compatibility not evaluated. Select a project with the compatibility command.';
            return document.blueprints.map((blueprint) => ({ blueprint, compatibilityMessage: message }));
        }
        return Promise.all(document.blueprints.map(async (blueprint) => ({ blueprint, compatibility: await evaluateBlueprintCompatibility(blueprint, projects[0], this.source.fileSystem) })));
    }
}
function emptyData(state: SidebarData['state']): SidebarData { return { state, projects: [], suggestionResult: { suggestions: [], warnings: [] }, blueprints: [], blueprintState: state }; }

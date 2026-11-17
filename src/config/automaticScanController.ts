import * as vscode from 'vscode';

import { TerminalBlueprintSettings } from './terminalBlueprintConfiguration';

export interface AutomaticScanTarget {
    refresh(): Promise<void>;
    invalidate(): void;
}

export interface AutomaticScanEnvironment {
    readSettings(): TerminalBlueprintSettings;
    hasWorkspace(): boolean;
    isWorkspaceTrusted(): boolean;
}

export class AutomaticScanController implements vscode.Disposable {
    private disposed = false;
    private settings: TerminalBlueprintSettings;

    public constructor(private readonly target: AutomaticScanTarget, private readonly environment: AutomaticScanEnvironment) {
        this.settings = environment.readSettings();
    }

    public onActivation(): void { this.requestIfEnabled(); }

    public onWorkspaceFoldersChanged(): void {
        if (this.disposed) { return; }
        this.target.invalidate();
        this.requestIfEnabled();
    }

    public onWorkspaceTrustGranted(): void { this.requestIfEnabled(); }

    public onConfigurationChanged(settings: TerminalBlueprintSettings): void {
        if (this.disposed) { return; }
        const previous = this.settings;
        this.settings = settings;
        const scanSettingsChanged = previous.scanMaxDepth !== settings.scanMaxDepth ||
            previous.excludedDirectories.join('\0') !== settings.excludedDirectories.join('\0');
        if (previous.autoScan && !settings.autoScan) {
            this.target.invalidate();
            return;
        }
        if (scanSettingsChanged) { this.target.invalidate(); }
        if ((!previous.autoScan && settings.autoScan) || (settings.autoScan && scanSettingsChanged)) {
            this.requestIfEnabled();
        }
    }

    public dispose(): void { this.disposed = true; }

    private requestIfEnabled(): void {
        if (this.disposed || !this.settings.autoScan || !this.environment.hasWorkspace() || !this.environment.isWorkspaceTrusted()) { return; }
        void this.target.refresh();
    }
}

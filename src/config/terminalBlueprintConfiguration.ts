import * as vscode from 'vscode';
import { MANDATORY_IGNORED_DIRECTORY_NAMES, type ScanLimits } from '../scanner/projectScanner';

export const DEFAULT_SCAN_MAX_DEPTH = 4;
export const MIN_SCAN_MAX_DEPTH = 0;
export const MAX_SCAN_MAX_DEPTH = 4;
export const MANDATORY_EXCLUDED_DIRECTORIES = MANDATORY_IGNORED_DIRECTORY_NAMES;

export interface TerminalBlueprintSettings {
    autoScan: boolean;
    showNotifications: boolean;
    scanMaxDepth: number;
    excludedDirectories: readonly string[];
}

export interface ConfigurationSource {
    get<T>(section: string, defaultValue?: T): T | undefined;
}

export interface ConfigurationApi {
    getConfiguration(section?: string): ConfigurationSource;
    onDidChangeConfiguration(listener: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;
}

export interface InformationMessageSink {
    showInformationMessage(message: string): Thenable<unknown>;
}

export function readTerminalBlueprintSettings(source: ConfigurationSource = vscode.workspace.getConfiguration('terminalBlueprint')): TerminalBlueprintSettings {
    const excluded = normalizeExcludedDirectories(source.get<unknown>('excludedDirectories'));
    return {
        autoScan: readBoolean(source.get<unknown>('autoScan'), false),
        showNotifications: readBoolean(source.get<unknown>('showNotifications'), true),
        scanMaxDepth: readScanDepth(source.get<unknown>('scanMaxDepth')),
        excludedDirectories: excluded
    };
}

export class TerminalBlueprintConfigurationService implements vscode.Disposable {
    private readonly changedEmitter = new vscode.EventEmitter<TerminalBlueprintSettings>();
    private readonly subscription: vscode.Disposable;
    public readonly onDidChange = this.changedEmitter.event;

    public constructor(private readonly api: ConfigurationApi = vscode.workspace) {
        this.subscription = api.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('terminalBlueprint')) { this.changedEmitter.fire(this.read()); }
        });
    }

    public read(): TerminalBlueprintSettings {
        return readTerminalBlueprintSettings(this.api.getConfiguration('terminalBlueprint'));
    }

    public dispose(): void { this.subscription.dispose(); this.changedEmitter.dispose(); }
}

export class TerminalBlueprintInformationService {
    public constructor(private readonly readSettings: () => TerminalBlueprintSettings, private readonly sink: InformationMessageSink = vscode.window) {}
    public show(message: string): void { if (this.readSettings().showNotifications) { void this.sink.showInformationMessage(message); } }
}

export function createScanLimits(settings: TerminalBlueprintSettings): ScanLimits {
    return { maxDepth: settings.scanMaxDepth, maxDirectories: 500, excludedDirectoryNames: settings.excludedDirectories };
}

function readBoolean(value: unknown, defaultValue: boolean): boolean { return typeof value === 'boolean' ? value : defaultValue; }
function readScanDepth(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= MIN_SCAN_MAX_DEPTH && value <= MAX_SCAN_MAX_DEPTH
        ? value : DEFAULT_SCAN_MAX_DEPTH;
}

function normalizeExcludedDirectories(value: unknown): string[] {
    const userEntries = Array.isArray(value) ? value : [];
    const safeEntries = userEntries.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().toLowerCase()).filter(isSafeDirectoryName);
    return [...new Set([...MANDATORY_EXCLUDED_DIRECTORIES, ...safeEntries])];
}

function isSafeDirectoryName(value: string): boolean {
    return value.length > 0 && value.length <= 100 && /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/.test(value);
}

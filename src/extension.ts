
import * as vscode from 'vscode';
import {
    CommandPreview,
    CommandSelectionUi,
    SuggestedCommandQuickPickItem,
    TerminalService,
    selectAndRunSuggestedCommand
} from './launcher/commandSelectionController';
import { TerminalLifecycleManager } from './launcher/terminalLifecycleManager';
import { createBlueprintFromInputs, manageBlueprintsFromInputs } from './blueprints/blueprintManagementController';
import { BlueprintManagementService } from './blueprints/blueprintManagementService';
import { formatScanOutput } from './output/scanOutputFormatter';
import { scanProjectsWithSettings } from './scanner/configuredProjectScanner';
import { generateCommandSuggestions } from './suggestions/commandSuggestionEngine';
import { BlueprintStorageService } from './storage/blueprintStorageService';
import { BlueprintTransferService, DuplicateBlueprintDecision } from './blueprints/blueprintTransferService';
import { inspectBlueprintCompatibility, BlueprintCompatibilityUi } from './compatibility/blueprintCompatibilityController';
import { formatBlueprintCompatibilityOutput } from './output/blueprintCompatibilityOutputFormatter';
import { BlueprintExecutionUi, selectAndRunBlueprint } from './launcher/blueprintExecutionController';
import { TerminalBlueprintTreeProvider } from './sidebar/terminalBlueprintTreeProvider';
import { SidebarDataController } from './sidebar/sidebarDataController';
import { TerminalBlueprintConfigurationService, TerminalBlueprintInformationService } from './config/terminalBlueprintConfiguration';
import { AutomaticScanController } from './config/automaticScanController';
import { openSupportDevelopment } from './support/supportDevelopment';

export function activate(context: vscode.ExtensionContext) {

    console.log('Terminal Blueprint extension activated.');

    // Create one Output Channel for our extension.
    const output = vscode.window.createOutputChannel(
        'Terminal Blueprint'
    );
    const terminalLifecycleManager = new TerminalLifecycleManager({
        onDidCloseTerminal(listener) {
            return vscode.window.onDidCloseTerminal(listener);
        }
    });
    const blueprintStorageService = new BlueprintStorageService(context.globalStorageUri);
    const blueprintManagementService = new BlueprintManagementService(blueprintStorageService);
    const blueprintTransferService = new BlueprintTransferService(blueprintStorageService);
    const configurationService = new TerminalBlueprintConfigurationService();
    const informationService = new TerminalBlueprintInformationService(() => configurationService.read());
    const scanConfiguredProjects = () => scanProjectsWithSettings(() => configurationService.read());
    const sidebarTreeProvider = new TerminalBlueprintTreeProvider();
    const sidebarTreeView = vscode.window.createTreeView('terminalBlueprint.sidebar', {
        treeDataProvider: sidebarTreeProvider,
        showCollapseAll: false
    });
    const sidebarDataController = new SidebarDataController(sidebarTreeProvider, {
        scanProjects: scanConfiguredProjects,
        generateSuggestions: generateCommandSuggestions,
        loadBlueprints: () => blueprintStorageService.load(),
        fileSystem: vscode.workspace.fs
    });
    const automaticScanController = new AutomaticScanController(sidebarDataController, {
        readSettings: () => configurationService.read(),
        hasWorkspace: () => (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
        isWorkspaceTrusted: () => vscode.workspace.isTrusted
    });
    const refreshSidebar = vscode.commands.registerCommand('terminal-blueprint.refreshSidebar', () => sidebarDataController.refresh());
    const supportDevelopment = vscode.commands.registerCommand('terminal-blueprint.supportDevelopment', () => openSupportDevelopment());
    const sidebarVisibility = sidebarTreeView.onDidChangeVisibility(() => {
        if (sidebarTreeView.visible) { void sidebarDataController.refresh(); }
    });
    const workspaceFoldersChanged = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        automaticScanController.onWorkspaceFoldersChanged();
        // Automatic scanning already refreshes a trusted workspace when enabled.
        // Keep the existing visible-sidebar refresh only when auto-scan is off.
        if (sidebarTreeView.visible && !configurationService.read().autoScan) { void sidebarDataController.refresh(); }
    });
    const configurationChanged = configurationService.onDidChange((settings) => automaticScanController.onConfigurationChanged(settings));
    const workspaceTrustGranted = vscode.workspace.onDidGrantWorkspaceTrust(() => automaticScanController.onWorkspaceTrustGranted());

    // Display the scanned project information.
    const scanProject = vscode.commands.registerCommand(
        'terminal-blueprint.scanProject',
        async () => {
            try {
                const projects = await scanConfiguredProjects();

                // Check whether a workspace is open.
                if (projects.length === 0) {
                    vscode.window.showWarningMessage(
                        'Terminal Blueprint: Please open a project folder before scanning.'
                    );
                    return;
                }

                // Clear previous results.
                output.clear();

                const suggestionResult = generateCommandSuggestions(projects);

                for (const line of formatScanOutput(projects, suggestionResult)) {
                    output.appendLine(line);
                }

                // Open the Output panel.
                output.show();

            } catch (error) {

                // Log technical details for debugging.
                console.error(
                    'Terminal Blueprint scan failed:',
                    error
                );

                // Show a friendly error to the user.
                vscode.window.showErrorMessage(
                    'Terminal Blueprint: Unable to scan the project. Check the developer console for details.'
                );
            }
        }
    );

    const runSuggestedCommand = vscode.commands.registerCommand(
        'terminal-blueprint.runSuggestedCommand',
        async () => {
            try {
                const projects = await scanConfiguredProjects();
                if (projects.length === 0) {
                    vscode.window.showWarningMessage(
                        'Terminal Blueprint: Please open a project folder before selecting a command.'
                    );
                    return;
                }

                const suggestions = generateCommandSuggestions(projects).suggestions;
                await selectAndRunSuggestedCommand(
                    suggestions,
                    () => vscode.workspace.isTrusted,
                createCommandSelectionUi(informationService),
                    { isAvailable: isAvailableDirectory },
                    createTerminalService(),
                    terminalLifecycleManager
                );
            } catch (error) {
                console.error('Terminal Blueprint command selection failed:', error);
                vscode.window.showErrorMessage(
                    'Terminal Blueprint: Unable to select a suggested command. Check the developer console for details.'
                );
            }
        }
    );

    const createBlueprint = vscode.commands.registerCommand(
        'terminal-blueprint.createBlueprint',
        async () => {
            const created = await runBlueprintManagementAction(() => createBlueprintFromInputs(blueprintManagementService));
            if (!created) { return; }
            await refreshSidebarAfterBlueprintStorageChange(sidebarDataController);
            informationService.show(`Terminal Blueprint: Created "${created.name}".`);
        }
    );

    const manageBlueprints = vscode.commands.registerCommand(
        'terminal-blueprint.manageBlueprints',
        async () => runBlueprintManagementAction(() => manageBlueprintsFromInputs(blueprintManagementService, (message) => informationService.show(message)))
    );
    const importBlueprints = vscode.commands.registerCommand('terminal-blueprint.importBlueprints', async () => runBlueprintManagementAction(async () => {
        const [uri] = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ['json'] }, openLabel: 'Import Blueprints' }) ?? [];
        if (!uri) { return; }
        const imported = await blueprintTransferService.importFile(uri, chooseDuplicateBlueprintAction);
        informationService.show(`Terminal Blueprint: Imported ${imported} blueprint(s).`);
    }));
    const exportBlueprints = vscode.commands.registerCommand('terminal-blueprint.exportBlueprints', async () => runBlueprintManagementAction(async () => {
        const choice = await vscode.window.showQuickPick([{ label: 'Export all blueprints', value: 'all' }, { label: 'Export one blueprint', value: 'one' }]);
        if (!choice) { return; }
        const uri = await vscode.window.showSaveDialog({ filters: { JSON: ['json'] }, saveLabel: 'Export Blueprints' });
        if (!uri) { return; }
        if (choice.value === 'all') { await blueprintTransferService.exportAll(uri); return; }
        const blueprints = await blueprintManagementService.list();
        const selected = await vscode.window.showQuickPick(blueprints.map((blueprint) => ({ label: blueprint.name, blueprint })));
        if (selected) { await blueprintTransferService.exportOne(uri, selected.blueprint.id); }
    }));
    const checkBlueprintCompatibility = vscode.commands.registerCommand('terminal-blueprint.checkBlueprintCompatibility', async () => {
        try {
            const inspection = await inspectBlueprintCompatibility(
                blueprintStorageService,
                scanConfiguredProjects,
                createBlueprintCompatibilityUi(),
                vscode.workspace.fs
            );
            if (inspection.outcome === 'no-blueprints') {
                informationService.show('Terminal Blueprint: No saved blueprints are available to inspect.');
                return;
            }
            if (inspection.outcome === 'no-projects') {
                vscode.window.showWarningMessage('Terminal Blueprint: Please open a project folder before checking compatibility.');
                return;
            }
            if (inspection.outcome === 'cancelled') { return; }
            if (inspection.outcome !== 'displayed') { return; }
            output.clear();
            for (const line of formatBlueprintCompatibilityOutput(inspection.blueprint, inspection.project, inspection.compatibility)) {
                output.appendLine(line);
            }
            output.show();
        } catch (error) {
            console.error('Terminal Blueprint compatibility inspection failed:', error);
            vscode.window.showErrorMessage('Terminal Blueprint: Unable to inspect blueprint compatibility. Existing blueprints were not changed.');
        }
    });
    const runBlueprint = vscode.commands.registerCommand('terminal-blueprint.runBlueprint', async () => {
        try {
            await selectAndRunBlueprint(
                blueprintStorageService,
                scanConfiguredProjects,
                () => vscode.workspace.isTrusted,
                createBlueprintExecutionUi(informationService),
                vscode.workspace.fs,
                createTerminalService(),
                terminalLifecycleManager,
                (blueprint, project, compatibility) => {
                    output.clear();
                    for (const line of formatBlueprintCompatibilityOutput(blueprint, project, compatibility)) { output.appendLine(line); }
                    // Compatibility is useful context, but revealing the Output channel must
                    // not take focus away from the command picker opened immediately after it.
                    output.show(true);
                }
            );
        } catch (error) {
            console.error('Terminal Blueprint blueprint execution selection failed:', error);
            vscode.window.showErrorMessage('Terminal Blueprint: Unable to prepare blueprint execution. No command was run.');
        }
    });

    // VS Code will clean these up when the extension stops.
    context.subscriptions.push(
        scanProject,
        runSuggestedCommand,
        createBlueprint,
        manageBlueprints,
        importBlueprints,
        exportBlueprints,
        checkBlueprintCompatibility,
        runBlueprint,
        refreshSidebar,
        supportDevelopment,
        sidebarTreeProvider,
        sidebarTreeView,
        sidebarDataController,
        sidebarVisibility,
        workspaceFoldersChanged,
        configurationService,
        configurationChanged,
        workspaceTrustGranted,
        automaticScanController,
        terminalLifecycleManager,
        output
    );
    automaticScanController.onActivation();
}

export function deactivate() {}

async function runBlueprintManagementAction<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
        return await action();
    } catch (error) {
        console.error('Terminal Blueprint blueprint management failed:', error);
        vscode.window.showErrorMessage('Terminal Blueprint: Unable to update local blueprints. Existing data was not changed.');
        return undefined;
    }
}

async function refreshSidebarAfterBlueprintStorageChange(sidebarDataController: SidebarDataController): Promise<void> {
    try {
        await sidebarDataController.refresh();
    } catch (error) {
        console.error('Terminal Blueprint sidebar refresh after blueprint storage change failed:', error);
    }
}

async function chooseDuplicateBlueprintAction(): Promise<DuplicateBlueprintDecision> {
    const choice = await vscode.window.showWarningMessage('A blueprint with this ID already exists.', { modal: true }, 'Skip', 'Import Copy', 'Cancel');
    return choice === 'Import Copy' ? 'copy' : choice === 'Skip' ? 'skip' : 'cancel';
}

function createCommandSelectionUi(informationService: TerminalBlueprintInformationService): CommandSelectionUi {
    return {
        async pickSuggestion(items: readonly SuggestedCommandQuickPickItem[]) {
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a verified command suggestion to preview',
                matchOnDescription: true,
                matchOnDetail: true
            });
            return selected?.suggestion;
        },
        async requestApproval(preview: CommandPreview) {
            const choice = await vscode.window.showInformationMessage(
                preview.message,
                { modal: true },
                'Approve',
                'Cancel'
            );
            return choice === 'Approve';
        },
        showInformation(message: string) {
            informationService.show(message);
        },
        showWarning(message: string) {
            void vscode.window.showWarningMessage(message);
        }
    };
}

function createBlueprintCompatibilityUi(): BlueprintCompatibilityUi {
    return {
        async pickBlueprint(items) {
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a saved blueprint to inspect', matchOnDescription: true, matchOnDetail: true
            });
            return selected?.blueprint;
        },
        async pickProject(items) {
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a detected project for compatibility inspection', matchOnDescription: true, matchOnDetail: true
            });
            return selected?.project;
        }
    };
}

function createBlueprintExecutionUi(informationService: TerminalBlueprintInformationService): BlueprintExecutionUi {
    return {
        ...createBlueprintCompatibilityUi(),
        async pickCommands(items) {
            const selected = await vscode.window.showQuickPick(items.map((item) => ({ ...item, picked: true })), {
                canPickMany: true, placeHolder: 'Select independently authorized blueprint commands to preview', matchOnDescription: true, matchOnDetail: true
            });
            return selected?.map((item) => item.commandId);
        },
        async acknowledgeWarning(result) {
            const choice = await vscode.window.showWarningMessage(`Compatibility warnings:\n${result.warnings.map((warning) => warning.message).join('\n')}\nContinue to command selection?`, { modal: true }, 'Continue', 'Cancel');
            return choice === 'Continue';
        },
        async confirmIncompatibleOverride(result) {
            const choice = await vscode.window.showWarningMessage(`Blueprint compatibility is INCOMPATIBLE:\n${result.mismatches.map((mismatch) => mismatch.message).join('\n')}\nContinue only with independently authorized commands?`, { modal: true }, 'Continue Anyway', 'Cancel');
            return choice === 'Continue Anyway';
        },
        async requestApproval(preview) {
            const choice = await vscode.window.showInformationMessage(preview.message, { modal: true }, 'Approve', 'Cancel');
            return choice === 'Approve';
        },
        showInformation(message) { informationService.show(message); },
        showWarning(message) { void vscode.window.showWarningMessage(message); }
    };
}

async function isAvailableDirectory(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
        return false;
    }
}

function createTerminalService(): TerminalService {
    return {
        createTerminal(options) {
            return vscode.window.createTerminal({
                name: options.name,
                cwd: options.cwd
            });
        }
    };
}

import * as vscode from 'vscode';

type SidebarCategory = 'projects' | 'commands' | 'blueprints';

interface CategoryDefinition {
    category: SidebarCategory;
    label: string;
    tooltip: string;
    icon: string;
    emptyLabel: string;
    emptyTooltip: string;
}

const categories: readonly CategoryDefinition[] = [
    { category: 'projects', label: 'Detected Projects', tooltip: 'Detected projects will appear here after a future sidebar refresh.', icon: 'folder-library', emptyLabel: 'No projects loaded', emptyTooltip: 'This sidebar foundation does not scan workspaces automatically.' },
    { category: 'commands', label: 'Suggested Commands', tooltip: 'Verified command suggestions will appear here in a future update.', icon: 'terminal', emptyLabel: 'No commands loaded', emptyTooltip: 'No command suggestions have been loaded into the sidebar.' },
    { category: 'blueprints', label: 'Saved Blueprints', tooltip: 'Saved blueprints will appear here in a future update.', icon: 'bookmark', emptyLabel: 'No blueprints loaded', emptyTooltip: 'No saved blueprints have been loaded into the sidebar.' }
];

export class TerminalBlueprintTreeItem extends vscode.TreeItem {
    public constructor(
        public readonly itemId: string,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        tooltip: string,
        icon?: string
    ) {
        super(label, collapsibleState);
        this.id = itemId;
        this.tooltip = tooltip;
        this.contextValue = itemId;
        this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
        this.accessibilityInformation = { label: `${label}. ${tooltip}` };
    }
}

export class TerminalBlueprintTreeProvider implements vscode.TreeDataProvider<TerminalBlueprintTreeItem>, vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<TerminalBlueprintTreeItem | undefined>();
    public readonly onDidChangeTreeData = this.changeEmitter.event;

    public getTreeItem(element: TerminalBlueprintTreeItem): vscode.TreeItem { return element; }

    public getChildren(element?: TerminalBlueprintTreeItem): TerminalBlueprintTreeItem[] {
        if (!element) {
            return categories.map((category) => new TerminalBlueprintTreeItem(
                `terminal-blueprint.category.${category.category}`,
                category.label,
                vscode.TreeItemCollapsibleState.Expanded,
                category.tooltip,
                category.icon
            ));
        }
        const category = categories.find((candidate) => element.itemId === `terminal-blueprint.category.${candidate.category}`);
        if (!category) { return []; }
        return [new TerminalBlueprintTreeItem(
            `terminal-blueprint.empty.${category.category}`,
            category.emptyLabel,
            vscode.TreeItemCollapsibleState.None,
            category.emptyTooltip
        )];
    }

    public refresh(): void { this.changeEmitter.fire(undefined); }
    public dispose(): void { this.changeEmitter.dispose(); }
}

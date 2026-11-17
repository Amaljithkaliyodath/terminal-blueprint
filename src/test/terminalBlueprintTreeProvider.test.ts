import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalBlueprintTreeProvider } from '../sidebar/terminalBlueprintTreeProvider';

suite('Terminal Blueprint Tree Provider', () => {
    test('provides stable native category and empty-state nodes', () => {
        const provider = new TerminalBlueprintTreeProvider();
        const roots = provider.getChildren();
        assert.deepStrictEqual(roots.map((item) => item.label), ['Detected Projects', 'Suggested Commands', 'Saved Blueprints']);
        assert.deepStrictEqual(roots.map((item) => item.id), ['terminal-blueprint.category.projects', 'terminal-blueprint.category.commands', 'terminal-blueprint.category.blueprints']);
        for (const root of roots) {
            assert.strictEqual(root.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(root.tooltip);
            assert.ok(root.iconPath instanceof vscode.ThemeIcon);
            const [empty] = provider.getChildren(root);
            assert.ok(String(empty.label).startsWith('No '));
            assert.strictEqual(empty.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.ok(empty.tooltip);
        }
        provider.dispose();
    });

    test('emits refresh events and stops emitting after disposal', () => {
        const provider = new TerminalBlueprintTreeProvider();
        let changes = 0;
        const subscription = provider.onDidChangeTreeData(() => { changes += 1; });
        provider.refresh();
        assert.strictEqual(changes, 1);
        provider.dispose();
        provider.refresh();
        assert.strictEqual(changes, 1);
        subscription.dispose();
    });

    test('declares the Activity Bar container, Tree View, and local icon', () => {
        const root = path.resolve(__dirname, '..', '..');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
            contributes: { viewsContainers: { activitybar: Array<{ id: string; title: string; icon: string }> }; views: Record<string, Array<{ id: string; name: string }>> };
        };
        const [container] = manifest.contributes.viewsContainers.activitybar.filter((item) => item.id === 'terminal-blueprint');
        assert.strictEqual(container.title, 'Terminal Blueprint');
        assert.strictEqual(container.icon, 'resources/terminal-blueprint.svg');
        assert.ok(fs.existsSync(path.join(root, container.icon)));
        assert.deepStrictEqual(manifest.contributes.views['terminal-blueprint'], [{ id: 'terminalBlueprint.sidebar', name: 'Terminal Blueprint' }]);
    });

    test('does not create terminals or execute commands while presenting the static tree', () => {
        const terminalCount = vscode.window.terminals.length;
        const provider = new TerminalBlueprintTreeProvider();
        provider.getChildren().flatMap((item) => provider.getChildren(item)).map((item) => provider.getTreeItem(item));
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
        provider.dispose();
    });
});

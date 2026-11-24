import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalBlueprintTreeProvider } from '../sidebar/terminalBlueprintTreeProvider';

suite('Terminal Blueprint Tree Provider', () => {
    test('provides stable native category and empty-state nodes', () => {
        const provider = new TerminalBlueprintTreeProvider();
        const roots = provider.getChildren();
        assert.deepStrictEqual(roots.map((item) => item.label), ['Detected Projects', 'Saved Blueprints', 'Support & About']);
        assert.deepStrictEqual(roots.map((item) => item.id), ['terminal-blueprint.category.projects', 'terminal-blueprint.category.blueprints', 'terminal-blueprint.category.support']);
        for (const root of roots) {
            assert.strictEqual(root.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            assert.ok(root.tooltip);
            assert.ok(root.iconPath instanceof vscode.ThemeIcon);
            const [child] = provider.getChildren(root);
            if (root.id === 'terminal-blueprint.category.support') {
                assert.strictEqual(child.label, 'Buy Me a Coffee');
                assert.strictEqual(child.command?.command, 'terminal-blueprint.supportDevelopment');
            } else {
                assert.ok(String(child.label).startsWith('No '));
                assert.strictEqual(child.collapsibleState, vscode.TreeItemCollapsibleState.None);
                assert.ok(child.tooltip);
            }
        }
        provider.dispose();
    });

    test('provides a secondary keyboard-accessible support action without terminal side effects', () => {
        const terminalCount = vscode.window.terminals.length;
        const provider = new TerminalBlueprintTreeProvider();
        const support = provider.getChildren(provider.getChildren().find((item) => item.id === 'terminal-blueprint.category.support'))[0];
        assert.strictEqual(support.id, 'terminal-blueprint.support-development');
        assert.strictEqual(support.label, 'Buy Me a Coffee');
        assert.strictEqual(support.command?.command, 'terminal-blueprint.supportDevelopment');
        assert.ok(support.iconPath instanceof vscode.ThemeIcon);
        assert.ok(support.accessibilityInformation?.label.includes('Buy Me a Coffee'));
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
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
            contributes: {
                viewsContainers: { activitybar: Array<{ id: string; title: string; icon: string }> };
                views: Record<string, Array<{ id: string; name: string }>>;
                menus: { 'view/title': Array<{ command: string; when: string }>; 'view/item/context': Array<{ command: string; when: string }> };
            };
        };
        const [container] = manifest.contributes.viewsContainers.activitybar.filter((item) => item.id === 'terminal-blueprint');
        assert.strictEqual(container.title, 'Terminal Blueprint');
        assert.strictEqual(container.icon, 'resources/terminal-blueprint.svg');
        assert.ok(fs.existsSync(path.join(root, container.icon)));
        assert.deepStrictEqual(manifest.contributes.views['terminal-blueprint'], [{ id: 'terminalBlueprint.sidebar', name: 'Terminal Blueprint' }]);
        assert.ok(manifest.contributes.menus['view/title'].some((item) => item.command === 'terminal-blueprint.scanProject' && item.when === 'view == terminalBlueprint.sidebar'));
        assert.ok(manifest.contributes.menus['view/title'].some((item) => item.command === 'terminal-blueprint.createBlueprint' && item.when === 'view == terminalBlueprint.sidebar'));
        assert.ok(manifest.contributes.menus['view/title'].some((item) => item.command === 'terminal-blueprint.manageBlueprints' && item.when === 'view == terminalBlueprint.sidebar'));
        assert.ok(manifest.contributes.menus['view/item/context'].some((item) => item.command === 'terminal-blueprint.runSuggestedCommand' && item.when.includes('terminal-blueprint.suggestion')));
    });

    test('does not create terminals or execute commands while presenting the static tree', () => {
        const terminalCount = vscode.window.terminals.length;
        const provider = new TerminalBlueprintTreeProvider();
        provider.getChildren().flatMap((item) => provider.getChildren(item)).map((item) => provider.getTreeItem(item));
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
        provider.dispose();
    });
});

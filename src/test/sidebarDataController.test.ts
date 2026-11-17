import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommandSuggestionResult } from '../models/commandSuggestion';
import { ProjectInfo } from '../scanner/projectScanner';
import { SidebarDataController, SidebarDataSource } from '../sidebar/sidebarDataController';
import { TerminalBlueprintTreeItem, TerminalBlueprintTreeProvider } from '../sidebar/terminalBlueprintTreeProvider';

suite('Sidebar Data Controller', () => {
    test('populates projects and deterministic per-project command groups', async () => {
        const first = project('web', 'apps/web', '/first/apps/web'); const second = project('api', 'services/api', '/second/services/api');
        const provider = new TerminalBlueprintTreeProvider();
        const controller = new SidebarDataController(provider, source([second, first], suggestions(first, second)));
        await controller.refresh();
        const roots = provider.getChildren();
        const projects = provider.getChildren(category(roots, 'projects'));
        assert.deepStrictEqual(projects.map((item) => item.label), ['web', 'api']);
        assert.ok(String(projects[0].description).includes('Next.js'));
        assert.ok(String(projects[0].tooltip).includes('Package manager: npm'));
        const commandGroups = provider.getChildren(category(roots, 'commands'));
        assert.deepStrictEqual(commandGroups.map((item) => item.label), ['web (apps/web)', 'api (services/api)']);
        const commands = provider.getChildren(commandGroups[0]);
        assert.deepStrictEqual(commands.map((item) => item.description), ['npm run build', 'npm run dev']);
        assert.ok(commands[0].tooltip?.toString().includes(first.workingDirectory.fsPath));
        controller.dispose(); provider.dispose();
    });

    test('shows clear empty and scanner-error states', async () => {
        const provider = new TerminalBlueprintTreeProvider();
        const empty = new SidebarDataController(provider, source([], { suggestions: [], warnings: [] }));
        await empty.refresh();
        assert.strictEqual(provider.getChildren(category(provider.getChildren(), 'projects'))[0].label, 'No projects detected');
        assert.strictEqual(provider.getChildren(category(provider.getChildren(), 'commands'))[0].label, 'No suggested commands');
        empty.dispose();
        const failing = new SidebarDataController(provider, { async scanProjects() { throw new Error('scanner'); }, generateSuggestions() { return { suggestions: [], warnings: [] }; } });
        await failing.refresh();
        assert.strictEqual(provider.getChildren(category(provider.getChildren(), 'projects'))[0].label, 'Unable to load data');
        failing.dispose(); provider.dispose();
    });

    test('serializes refreshes, invalidates stale work, and ignores loads after disposal', async () => {
        const provider = new TerminalBlueprintTreeProvider();
        const pending = deferred<ProjectInfo[]>(); let calls = 0;
        const controller = new SidebarDataController(provider, { async scanProjects() { calls += 1; return pending.promise; }, generateSuggestions(projects) { return { suggestions: [], warnings: [] }; } });
        const first = controller.refresh(); const duplicate = controller.refresh();
        assert.strictEqual(first, duplicate); assert.strictEqual(calls, 1);
        controller.invalidate(); pending.resolve([project('stale', '.', '/stale')]); await first;
        assert.strictEqual(provider.getChildren(category(provider.getChildren(), 'projects'))[0].label, 'No projects loaded');
        controller.dispose(); provider.dispose();
    });

    test('does not create terminals while loading sidebar data', async () => {
        const terminalCount = vscode.window.terminals.length;
        const provider = new TerminalBlueprintTreeProvider(); const controller = new SidebarDataController(provider, source([project('web', '.', '/workspace')], { suggestions: [], warnings: [] }));
        await controller.refresh();
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
        controller.dispose(); provider.dispose();
    });
});

function category(items: readonly TerminalBlueprintTreeItem[], name: string): TerminalBlueprintTreeItem { const item = items.find((candidate) => candidate.itemId === `terminal-blueprint.category.${name}`); assert.ok(item); return item!; }
function project(name: string, relativePath: string, path: string): ProjectInfo { return { name, relativePath, workingDirectory: vscode.Uri.parse(`memfs:${path}`), technologies: ['Next.js'], packageManager: { name: 'npm', candidates: ['npm'], source: 'lockfile', isAmbiguous: false }, scripts: [], composerScripts: [], hasDjangoManagePy: false }; }
function suggestions(first: ProjectInfo, second: ProjectInfo): CommandSuggestionResult { return { warnings: [], suggestions: [suggestion('z', 'Run dev', 'npm run dev', first), suggestion('a', 'Run build', 'npm run build', first), suggestion('b', 'Run test', 'npm run test', second)] }; }
function suggestion(id: string, title: string, command: string, project: ProjectInfo) { return { id, title, command, description: `${title} description`, workingDirectory: project.workingDirectory, project, source: 'package.json script' as const, reason: 'Verified package.json script.' }; }
function source(projects: ProjectInfo[], result: CommandSuggestionResult): SidebarDataSource { return { async scanProjects() { return projects; }, generateSuggestions() { return result; } }; }
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } { let resolve!: (value: T) => void; return { promise: new Promise<T>((complete) => { resolve = complete; }), resolve }; }

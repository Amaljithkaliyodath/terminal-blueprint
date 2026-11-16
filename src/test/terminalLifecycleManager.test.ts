import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalHandle } from '../launcher/commandSelectionController';
import { TerminalCloseEventSource, TerminalLifecycleManager } from '../launcher/terminalLifecycleManager';

suite('Terminal Lifecycle Manager', () => {
    test('tracks independently named terminals and removes only closed Blueprint terminals', () => {
        const eventSource = new TestTerminalCloseEventSource();
        const manager = new TerminalLifecycleManager(eventSource);
        const first = createTerminal();
        const second = createTerminal();
        const firstName = manager.createTerminalName('web', 'npm run dev');
        const secondName = manager.createTerminalName('api', 'go test ./...');

        manager.track(first, firstName, 'npm run dev', vscode.Uri.parse('file:///first/apps/web'));
        manager.track(second, secondName, 'go test ./...', vscode.Uri.parse('file:///second/services/api'));

        assert.notStrictEqual(firstName, secondName);
        assert.ok(firstName.includes('web'));
        assert.ok(firstName.includes('npm run dev'));
        assert.strictEqual(manager.trackedTerminalCount, 2);

        eventSource.fire(first);
        assert.strictEqual(manager.trackedTerminalCount, 1);

        eventSource.fire(createTerminal());
        assert.strictEqual(manager.trackedTerminalCount, 1);
    });

    test('disposes its one lifecycle listener and clears session tracking', () => {
        const eventSource = new TestTerminalCloseEventSource();
        const manager = new TerminalLifecycleManager(eventSource);
        manager.track(createTerminal(), 'Terminal Blueprint: web - npm run dev (1)', 'npm run dev', vscode.Uri.parse('file:///workspace/web'));

        manager.dispose();

        assert.strictEqual(eventSource.listenerCount, 0);
        assert.strictEqual(manager.trackedTerminalCount, 0);
    });
});

class TestTerminalCloseEventSource implements TerminalCloseEventSource {
    private readonly listeners = new Set<(terminal: TerminalHandle) => void>();

    public get listenerCount(): number {
        return this.listeners.size;
    }

    public onDidCloseTerminal(listener: (terminal: TerminalHandle) => void): vscode.Disposable {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    public fire(terminal: TerminalHandle): void {
        for (const listener of this.listeners) {
            listener(terminal);
        }
    }
}

function createTerminal(): TerminalHandle {
    return {
        sendText() {},
        show() {}
    };
}

import * as assert from 'assert';
import {
    analyzePackageJson,
    detectPackageManager,
    getScriptInvocation
} from '../scanner/packageJsonScanner';

suite('Package JSON Scanner', () => {
    test('detects Next.js, React, TypeScript, package manager, and scripts', () => {
        const result = analyzePackageJson({
            packageManager: 'pnpm@9.15.0',
            dependencies: {
                next: '^15.0.0',
                react: '^19.0.0'
            },
            devDependencies: {
                typescript: '^5.0.0'
            },
            scripts: {
                dev: 'next dev',
                build: 'next build'
            }
        }, ['pnpm-lock.yaml']);

        assert.deepStrictEqual(result.technologies, ['Next.js', 'React', 'TypeScript']);
        assert.deepStrictEqual(result.packageManager, {
            name: 'pnpm',
            candidates: ['pnpm'],
            source: 'packageManager field',
            isAmbiguous: false
        });
        assert.deepStrictEqual(result.scripts, [
            { name: 'dev', command: 'next dev' },
            { name: 'build', command: 'next build' }
        ]);
    });

    test('detects a package manager from one lockfile', () => {
        assert.deepStrictEqual(
            detectPackageManager(undefined, ['yarn.lock']),
            {
                name: 'yarn',
                candidates: ['yarn'],
                source: 'lockfile',
                isAmbiguous: false
            }
        );
    });

    test('reports conflicting package-manager evidence', () => {
        assert.deepStrictEqual(
            detectPackageManager('npm@11.0.0', ['pnpm-lock.yaml']),
            {
                name: 'npm',
                candidates: ['npm', 'pnpm'],
                source: 'packageManager field',
                isAmbiguous: true
            }
        );
    });

    test('ignores non-string scripts and unknown metadata', () => {
        const result = analyzePackageJson({
            dependencies: 'not an object',
            scripts: {
                valid: 'node app.js',
                invalid: 42
            }
        });

        assert.deepStrictEqual(result.technologies, []);
        assert.deepStrictEqual(result.scripts, [
            { name: 'valid', command: 'node app.js' }
        ]);
        assert.strictEqual(result.packageManager, undefined);
    });

    test('builds invocations only for an unambiguous package manager', () => {
        assert.strictEqual(
            getScriptInvocation('dev', {
                name: 'npm',
                candidates: ['npm'],
                source: 'lockfile',
                isAmbiguous: false
            }),
            'npm run dev'
        );
        assert.strictEqual(
            getScriptInvocation('dev', {
                candidates: ['npm', 'pnpm'],
                source: 'lockfile',
                isAmbiguous: true
            }),
            undefined
        );
    });
});

import * as assert from 'assert';
import { analyzePhpMetadata } from '../scanner/phpScanner';

suite('PHP Scanner', () => {
    test('detects Composer and Laravel from an explicit framework dependency', () => {
        const result = analyzePhpMetadata(JSON.stringify({
            require: { 'laravel/framework': '^11.0' }
        }), false);

        assert.deepStrictEqual(result.technologies, ['PHP', 'Composer', 'Laravel']);
    });

    test('detects Laravel from artisan without assuming Composer metadata exists', () => {
        assert.deepStrictEqual(
            analyzePhpMetadata(undefined, true).technologies,
            ['PHP', 'Laravel']
        );
    });

    test('does not infer Laravel from arbitrary Composer packages', () => {
        const result = analyzePhpMetadata(JSON.stringify({
            require: { 'symfony/console': '^7.0' }
        }), false);

        assert.deepStrictEqual(result.technologies, ['PHP', 'Composer']);
    });
});

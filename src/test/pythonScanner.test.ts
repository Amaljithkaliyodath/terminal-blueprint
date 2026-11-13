import * as assert from 'assert';
import { analyzePythonMetadata } from '../scanner/pythonScanner';

suite('Python Scanner', () => {
    test('detects Django and pip from requirements metadata', () => {
        const result = analyzePythonMetadata({
            'requirements.txt': 'Django>=5.0\nrequests==2.32.0\n'
        });

        assert.deepStrictEqual(result.technologies, [
            'Python',
            'pip (requirements.txt)',
            'Django'
        ]);
    });

    test('detects Flask and FastAPI from pyproject and Pipenv metadata', () => {
        const result = analyzePythonMetadata({
            'pyproject.toml': '[project]\ndependencies = ["fastapi>=0.115"]',
            Pipfile: '[packages]\nflask = "*"'
        });

        assert.deepStrictEqual(result.technologies, [
            'Python',
            'Pipenv',
            'Flask',
            'FastAPI'
        ]);
    });

    test('detects Poetry, uv, and Django manage.py tooling indicators', () => {
        const result = analyzePythonMetadata({
            'poetry.lock': '[[package]]\nname = "requests"',
            'uv.lock': 'version = 1',
            'manage.py': 'from django.core.management import execute_from_command_line'
        });

        assert.deepStrictEqual(result.technologies, [
            'Python',
            'Poetry',
            'uv',
            'Django'
        ]);
    });

    test('does not mistake unrelated metadata text for a framework dependency', () => {
        const result = analyzePythonMetadata({
            'pyproject.toml': '[project]\nname = "django-helper-not-the-framework"'
        });

        assert.deepStrictEqual(result.technologies, ['Python']);
    });
});

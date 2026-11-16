import {
    CommandSuggestion,
    CommandSuggestionResult,
    CommandSuggestionSource,
    CommandSuggestionWarning,
    CommandSuggestionWarningCode
} from '../models/commandSuggestion';
import { getScriptInvocation } from '../scanner/packageJsonScanner';
import { ProjectInfo } from '../scanner/projectScanner';

export function generateCommandSuggestions(
    projects: readonly ProjectInfo[]
): CommandSuggestionResult {
    const suggestions: CommandSuggestion[] = [];
    const warnings: CommandSuggestionWarning[] = [];
    const suggestionIds = new Set<string>();
    const warningIds = new Set<string>();
    const addSuggestion: SuggestionAdder = (
        project, key, title, description, command, source, reason
    ) => {
        const id = createSuggestionId(project, key);
        if (!suggestionIds.has(id)) {
            suggestionIds.add(id);
            suggestions.push({ id, title, description, command, workingDirectory: project.workingDirectory, project, source, reason });
        }
    };
    const addWarning: WarningAdder = (project, code, description) => {
        const id = `warning:${encodeURIComponent(project.workingDirectory.toString())}:${code}`;
        if (!warningIds.has(id)) {
            warningIds.add(id);
            warnings.push({ id, code, description, project });
        }
    };

    for (const project of [...projects].sort(compareProjects)) {
        addPackageScriptSuggestions(project, addSuggestion, addWarning);
        addComposerScriptSuggestions(project, addSuggestion, addWarning);
        addStandardToolSuggestions(project, addSuggestion);
    }

    return { suggestions, warnings };
}

function addPackageScriptSuggestions(project: ProjectInfo, addSuggestion: SuggestionAdder, addWarning: WarningAdder): void {
    if (project.scripts.length === 0) {
        return;
    }

    if (!project.packageManager?.name || project.packageManager.isAmbiguous) {
        const candidates = project.packageManager?.candidates.join(', ');
        addWarning(
            project,
            project.packageManager?.isAmbiguous ? 'ambiguous-package-manager' : 'missing-package-manager',
            project.packageManager?.isAmbiguous
                ? `Cannot suggest executable package scripts for ${project.name}: package manager is ambiguous (${candidates}).`
                : `Cannot suggest executable package scripts for ${project.name}: no verified package manager was detected.`
        );
        return;
    }

    for (const script of [...project.scripts].sort(compareScripts)) {
        if (!isSafeScriptName(script.name)) {
            addWarning(project, 'unsafe-script-name', `Cannot safely suggest the package.json script "${script.name}" because its name is not shell-safe.`);
            continue;
        }

        const command = getScriptInvocation(script.name, project.packageManager);
        if (command) {
            addSuggestion(project, `package-script:${script.name}`, `Run ${script.name}`, `Run the ${script.name} package.json script for ${project.name}.`, command, 'package.json script', `package.json script: ${script.command}`);
        }
    }
}

function addComposerScriptSuggestions(project: ProjectInfo, addSuggestion: SuggestionAdder, addWarning: WarningAdder): void {
    for (const script of [...project.composerScripts].sort(compareScripts)) {
        if (!isSafeScriptName(script.name)) {
            addWarning(project, 'unsafe-script-name', `Cannot safely suggest the Composer script "${script.name}" because its name is not shell-safe.`);
            continue;
        }

        addSuggestion(project, `composer-script:${script.name}`, `Run Composer ${script.name}`, `Run the ${script.name} Composer script for ${project.name}.`, `composer run ${script.name}`, 'composer script', `composer.json script: ${script.command}`);
    }
}

function addStandardToolSuggestions(project: ProjectInfo, addSuggestion: SuggestionAdder): void {
    if (project.technologies.includes('Maven')) {
        addSuggestion(project, 'maven:test', 'Run Maven tests', 'Run Maven\'s standard test lifecycle phase.', 'mvn test', 'Maven lifecycle', 'Verified pom.xml metadata.');
        addSuggestion(project, 'maven:package', 'Package with Maven', 'Run Maven\'s standard package lifecycle phase.', 'mvn package', 'Maven lifecycle', 'Verified pom.xml metadata.');
    }
    if (project.technologies.includes('Gradle')) {
        addSuggestion(project, 'gradle:tasks', 'List Gradle tasks', 'List tasks declared by the verified Gradle build.', 'gradle tasks', 'Gradle standard task', 'Verified Gradle build metadata.');
    }
    if (project.technologies.includes('Go modules')) {
        addSuggestion(project, 'go:test', 'Run Go tests', 'Run standard Go tests for packages in the verified module.', 'go test ./...', 'Go module', 'Verified go.mod module declaration.');
        addSuggestion(project, 'go:build', 'Build Go module', 'Build packages in the verified Go module.', 'go build ./...', 'Go module', 'Verified go.mod module declaration.');
    }
    if (project.technologies.includes('Cargo')) {
        addSuggestion(project, 'cargo:test', 'Run Cargo tests', 'Run standard Cargo tests for the verified manifest.', 'cargo test', 'Cargo package', 'Verified Cargo.toml package or workspace metadata.');
        addSuggestion(project, 'cargo:build', 'Build with Cargo', 'Build the verified Cargo package or workspace.', 'cargo build', 'Cargo package', 'Verified Cargo.toml package or workspace metadata.');
    }
    if (project.hasDjangoManagePy) {
        addSuggestion(project, 'django:runserver', 'Start Django development server', 'Use the verified manage.py entrypoint.', 'python manage.py runserver', 'Django manage.py', 'Verified manage.py file.');
    }
}

type SuggestionAdder = (project: ProjectInfo, key: string, title: string, description: string, command: string, source: CommandSuggestionSource, reason: string) => void;
type WarningAdder = (project: ProjectInfo, code: CommandSuggestionWarningCode, description: string) => void;

function createSuggestionId(project: ProjectInfo, key: string): string {
    return `suggestion:${encodeURIComponent(project.workingDirectory.toString())}:${encodeURIComponent(key)}`;
}

function isSafeScriptName(name: string): boolean {
    return /^[A-Za-z0-9:_-]+$/.test(name);
}

function compareProjects(left: ProjectInfo, right: ProjectInfo): number {
    return left.workingDirectory.toString().localeCompare(right.workingDirectory.toString()) || left.relativePath.localeCompare(right.relativePath) || left.name.localeCompare(right.name);
}

function compareScripts(left: ProjectInfo['scripts'][number], right: ProjectInfo['scripts'][number]): number {
    return left.name.localeCompare(right.name) || left.command.localeCompare(right.command);
}

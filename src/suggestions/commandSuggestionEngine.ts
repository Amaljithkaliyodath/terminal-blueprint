import {
    CommandSuggestion,
    CommandSuggestionResult,
    CommandSuggestionWarning
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

    for (const project of [...projects].sort(compareProjects)) {
        if (project.scripts.length === 0) {
            continue;
        }

        if (!project.packageManager?.name || project.packageManager.isAmbiguous) {
            const warning = createPackageManagerWarning(project);
            if (!warningIds.has(warning.id)) {
                warningIds.add(warning.id);
                warnings.push(warning);
            }
            continue;
        }

        for (const script of [...project.scripts].sort(compareScripts)) {
            const command = getScriptInvocation(script.name, project.packageManager);
            if (!command) {
                continue;
            }

            const id = createSuggestionId(project, script.name);
            if (suggestionIds.has(id)) {
                continue;
            }

            suggestionIds.add(id);
            suggestions.push({
                id,
                title: `Run ${script.name}`,
                description: `Run the ${script.name} package.json script for ${project.name}.`,
                command,
                workingDirectory: project.workingDirectory,
                project,
                source: 'package.json script',
                reason: `package.json script: ${script.command}`
            });
        }
    }

    return { suggestions, warnings };
}

function createPackageManagerWarning(project: ProjectInfo): CommandSuggestionWarning {
    const isAmbiguous = project.packageManager?.isAmbiguous === true;
    const candidates = project.packageManager?.candidates.join(', ');

    return {
        id: `warning:${encodeURIComponent(project.workingDirectory.toString())}:${
            isAmbiguous ? 'ambiguous-package-manager' : 'missing-package-manager'
        }`,
        code: isAmbiguous ? 'ambiguous-package-manager' : 'missing-package-manager',
        description: isAmbiguous
            ? `Cannot suggest executable package scripts for ${project.name}: package manager is ambiguous (${candidates}).`
            : `Cannot suggest executable package scripts for ${project.name}: no verified package manager was detected.`,
        project
    };
}

function createSuggestionId(project: ProjectInfo, scriptName: string): string {
    return `package-script:${encodeURIComponent(project.workingDirectory.toString())}:${
        encodeURIComponent(scriptName)
    }`;
}

function compareProjects(left: ProjectInfo, right: ProjectInfo): number {
    return left.workingDirectory.toString().localeCompare(right.workingDirectory.toString()) ||
        left.relativePath.localeCompare(right.relativePath) ||
        left.name.localeCompare(right.name);
}

function compareScripts(
    left: ProjectInfo['scripts'][number],
    right: ProjectInfo['scripts'][number]
): number {
    return left.name.localeCompare(right.name) || left.command.localeCompare(right.command);
}

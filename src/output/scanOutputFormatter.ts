import { CommandSuggestionResult } from '../models/commandSuggestion';
import { getScriptInvocation } from '../scanner/packageJsonScanner';
import { ProjectInfo } from '../scanner/projectScanner';

export function formatScanOutput(
    projects: readonly ProjectInfo[],
    suggestionResult: CommandSuggestionResult
): string[] {
    const lines = [
        '================================',
        '      TERMINAL BLUEPRINT',
        '        PROJECT SCANNER',
        '================================',
        ''
    ];

    for (const project of [...projects].sort(compareProjects)) {
        const suggestions = suggestionResult.suggestions.filter(
            (suggestion) => suggestion.project.workingDirectory.toString() ===
                project.workingDirectory.toString()
        );
        const warnings = suggestionResult.warnings.filter(
            (warning) => warning.project.workingDirectory.toString() ===
                project.workingDirectory.toString()
        );

        lines.push(`Project: ${formatProject(project)}`);
        lines.push(`Working directory: ${formatWorkingDirectory(project)}`);
        lines.push(`Detected: ${project.technologies.join(', ') || 'Unknown'}`);

        if (project.packageManager) {
            const { candidates, isAmbiguous, name, source } = project.packageManager;
            const packageManager = isAmbiguous
                ? `Ambiguous (${candidates.join(', ')})`
                : name ?? candidates.join(', ');
            lines.push(
                `Package manager: ${packageManager}${source ? ` (${source})` : ''}`
            );
        }

        if (project.scripts.length > 0) {
            lines.push('Available scripts:');
            for (const script of project.scripts) {
                const invocation = getScriptInvocation(script.name, project.packageManager);
                lines.push(
                    `  ${script.name}: ${invocation ?? 'Invocation unavailable'} (${script.command})`
                );
            }
        }

        if (suggestions.length > 0) {
            lines.push('Suggested commands:');
            for (const suggestion of suggestions) {
                lines.push(`  ${suggestion.title}`);
                lines.push(`    Command: ${suggestion.command}`);
                lines.push(`    Description: ${suggestion.description}`);
                lines.push(`    Project: ${formatProject(suggestion.project)}`);
                lines.push(
                    `    Working directory: ${formatWorkingDirectory(suggestion.project)}`
                );
            }
        }

        if (warnings.length > 0) {
            lines.push('Package-manager warnings:');
            for (const warning of warnings) {
                lines.push(`  Warning: ${warning.description}`);
            }
        }

        if (project.scripts.length > 0 && suggestions.length === 0) {
            lines.push('No safe command suggestions are available for this project.');
        }

        lines.push('--------------------------------');
    }

    if (suggestionResult.suggestions.length === 0) {
        lines.push('');
        lines.push('No safe command suggestions are available in this workspace.');
    }

    lines.push('');
    lines.push('Scan completed. No commands executed.');
    return lines;
}

function compareProjects(left: ProjectInfo, right: ProjectInfo): number {
    return left.workingDirectory.toString().localeCompare(right.workingDirectory.toString()) ||
        left.relativePath.localeCompare(right.relativePath) ||
        left.name.localeCompare(right.name);
}

function formatProject(project: ProjectInfo): string {
    return `${project.name} (${project.relativePath})`;
}

function formatWorkingDirectory(project: ProjectInfo): string {
    return project.workingDirectory.fsPath || project.workingDirectory.toString();
}

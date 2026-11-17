import { BlueprintCompatibilityResult } from '../compatibility/blueprintCompatibilityEngine';
import { TerminalBlueprint } from '../models/terminalBlueprint';
import { ProjectInfo } from '../scanner/projectScanner';

export function formatBlueprintCompatibilityOutput(
    blueprint: TerminalBlueprint,
    project: ProjectInfo,
    compatibility: BlueprintCompatibilityResult
): string[] {
    const lines = [
        '================================',
        '      TERMINAL BLUEPRINT',
        '    BLUEPRINT COMPATIBILITY',
        '================================',
        `Blueprint: ${blueprint.name}`,
        `Blueprint ID: ${blueprint.id}`,
        `Project: ${project.name} (${project.relativePath})`,
        `Working directory: ${project.workingDirectory.toString()}`,
        `Status: ${compatibility.status}`,
        ''
    ];
    appendIssues(lines, 'Matched requirements:', compatibility.matchedRequirements);
    appendIssues(lines, 'Warnings:', compatibility.warnings);
    appendIssues(lines, 'Mismatches:', compatibility.mismatches);
    lines.push('Reasons:');
    for (const reason of compatibility.reasons) { lines.push(`  - ${reason}`); }
    lines.push('Command working directories:');
    for (const finding of compatibility.commandWorkingDirectories) {
        const command = blueprint.commands.find((candidate) => candidate.id === finding.commandId);
        lines.push(`  ${command?.label ?? finding.commandId}: ${finding.status} (${finding.relativePath})`);
    }
    lines.push('');
    lines.push('Compatibility is informational only. It does not authorize or execute any command.');
    return lines;
}

function appendIssues(lines: string[], heading: string, issues: readonly { message: string }[]): void {
    lines.push(heading);
    if (issues.length === 0) { lines.push('  None'); return; }
    for (const issue of issues) { lines.push(`  - ${issue.message}`); }
}

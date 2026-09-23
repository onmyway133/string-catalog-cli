import { Command } from 'commander';
import { StringCatalog } from '../../index.js';
import { IssueKind } from '../../types.js';
import { printTable, printJson, printError, parseIntOption } from '../output.js';

const KINDS: IssueKind[] = [
    'extra-placeholder',
    'wrong-placeholder-type',
    'malformed-placeholder',
    'missing-placeholder',
    'raw-key',
    'empty',
];

export function createCheckCommand(): Command {
    return new Command('check')
        .description(
            'Find translations that break at runtime: placeholder mismatches, raw keys shown as text, empty values',
        )
        .argument('<file>', 'Path to .xcstrings file')
        .option('--language <lang>', 'Check only a specific language code')
        .option('--kind <kinds>', `Comma-separated issue kinds: ${KINDS.join(', ')}`)
        .option('--include-stale', 'Include keys whose extractionState is stale (no longer in code)')
        .option('--limit <n>', 'Maximum number of issues to return', '100')
        .option('--json', 'Output as JSON')
        .action(
            (
                file: string,
                options: { language?: string; kind?: string; includeStale?: boolean; limit: string; json?: boolean },
            ) => {
                const kinds = options.kind?.split(',').map((k) => k.trim()) as IssueKind[] | undefined;
                const unknown = kinds?.filter((k) => !KINDS.includes(k));
                if (unknown?.length) {
                    printError(`Unknown kind: ${unknown.join(', ')}. Valid: ${KINDS.join(', ')}`);
                    process.exit(1);
                }

                const catalog = new StringCatalog(file);
                const all = catalog.check({ language: options.language, includeStale: options.includeStale, kinds });
                const limit = parseIntOption(options.limit, '--limit');
                const issues = all.slice(0, limit);

                const counts: Partial<Record<IssueKind, number>> = {};
                for (const issue of all) counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;

                if (options.json) {
                    printJson({ total: all.length, counts, hasMore: all.length > limit, issues });
                } else if (all.length === 0) {
                    console.log('No issues found.');
                } else {
                    printTable(
                        ['Key', 'Language', 'Kind', 'Expected', 'Found', 'Value'],
                        issues.map((i) => [
                            i.key,
                            i.form ? `${i.language} (${i.form})` : i.language,
                            i.kind,
                            i.expected?.join(' ') ?? '',
                            i.found?.join(' ') ?? '',
                            i.value,
                        ]),
                    );
                    const summary = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ');
                    console.log(`\n${all.length} issue(s): ${summary}.`);
                    if (all.length > limit) console.log(`Showing first ${limit}, use --limit or --kind to narrow.`);
                }
                if (all.length > 0) process.exitCode = 1;
            },
        );
}

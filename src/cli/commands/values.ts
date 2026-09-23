import { Command } from 'commander';
import { StringCatalog } from '../../index.js';
import { printTable, printJson, parseIntOption } from '../output.js';

export function createValuesCommand(): Command {
    return new Command('values')
        .description('List every key with its source text and value in one language, for reviewing translations')
        .argument('<file>', 'Path to .xcstrings file')
        .requiredOption('--language <lang>', 'Language to list (e.g. "de")')
        .option('--compare <lang>', 'Also show the value in another language')
        .option('--include-stale', 'Include keys whose extractionState is stale (no longer in code)')
        .option('--limit <n>', 'Maximum number of keys to return', '100')
        .option('--offset <n>', 'Number of keys to skip', '0')
        .option('--json', 'Output as JSON')
        .action(
            (
                file: string,
                options: {
                    language: string;
                    compare?: string;
                    includeStale?: boolean;
                    limit: string;
                    offset: string;
                    json?: boolean;
                },
            ) => {
                const catalog = new StringCatalog(file);
                const all = catalog.getValues(options.language, {
                    compare: options.compare,
                    includeStale: options.includeStale,
                });
                const limit = parseIntOption(options.limit, '--limit');
                const offset = parseIntOption(options.offset, '--offset');
                const items = all.slice(offset, offset + limit);
                const hasMore = offset + limit < all.length;

                if (options.json) {
                    printJson({ language: options.language, total: all.length, offset, limit, hasMore, items });
                    return;
                }

                const headers = ['Key', 'Source', options.language];
                if (options.compare) headers.push(options.compare);
                headers.push('State');
                printTable(
                    headers,
                    items.map((i) => {
                        const row = [i.key, i.source, i.value ?? '(missing)'];
                        if (options.compare) row.push(i.compare ?? '(missing)');
                        row.push(i.state ?? '');
                        return row;
                    }),
                );
                if (hasMore) {
                    console.log(`\n${all.length} keys, showing ${offset + 1}-${offset + items.length}, use --offset ${offset + limit} for more.`);
                }
            },
        );
}

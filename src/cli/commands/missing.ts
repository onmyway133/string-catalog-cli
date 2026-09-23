import { Command } from 'commander';
import { StringCatalog } from '../../index.js';
import { printTable, printJson, parseIntOption } from '../output.js';

export function createMissingCommand(): Command {
    return new Command('missing')
        .description('List keys that are missing translations (skips keys removed from code)')
        .argument('<file>', 'Path to .xcstrings file')
        .option('--language <lang>', 'Check only a specific language code (e.g. "de")')
        .option('--with-source', 'Include source text and comment for each key')
        .option('--include-stale', 'Include keys whose extractionState is stale (no longer in code)')
        .option('--limit <n>', 'Maximum number of keys to return', '100')
        .option('--offset <n>', 'Number of keys to skip', '0')
        .option('--json', 'Output as JSON')
        .action(
            (
                file: string,
                options: {
                    language?: string;
                    withSource?: boolean;
                    includeStale?: boolean;
                    limit: string;
                    offset: string;
                    json?: boolean;
                },
            ) => {
                const catalog = new StringCatalog(file);
                const all = catalog.getMissingTranslations(options.language, {
                    includeStale: options.includeStale,
                });
                const limit = parseIntOption(options.limit, '--limit');
                const offset = parseIntOption(options.offset, '--offset');
                const page = all.slice(offset, offset + limit);
                const hasMore = offset + limit < all.length;

                const items = page.map((m) => {
                    const item: Record<string, unknown> = { key: m.key };
                    if (options.withSource) {
                        const [source] = catalog.getSourceTexts([m.key]).items;
                        item.source = source.source;
                        if (source.comment) item.comment = source.comment;
                    }
                    // With a single --language the list is redundant, so omit it.
                    if (!options.language) item.missing = m.missingLanguages;
                    return item;
                });

                if (options.json) {
                    printJson({ total: all.length, offset, limit, hasMore, items });
                    return;
                }

                if (all.length === 0) {
                    console.log('All keys are fully translated.');
                    return;
                }

                const headers = ['Key'];
                if (options.withSource) headers.push('Source', 'Comment');
                if (!options.language) headers.push('Missing Languages');
                const rows = items.map((item) => {
                    const row = [String(item.key)];
                    if (options.withSource) row.push(String(item.source), String(item.comment ?? ''));
                    if (!options.language) row.push((item.missing as string[]).join(', '));
                    return row;
                });
                printTable(headers, rows);
                console.log(`\n${all.length} key(s) missing translations.`);
                if (hasMore) {
                    console.log(
                        `Showing ${offset + 1}-${offset + page.length}, use --offset ${offset + limit} for more.`,
                    );
                }
            },
        );
}

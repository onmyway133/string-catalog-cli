import { Command } from 'commander';
import { StringCatalog } from '../../index.js';
import { printTable, printJson, printError, readStdin } from '../output.js';

export function createSourceCommand(): Command {
    return new Command('source')
        .description('Get source text and comment for many keys at once')
        .argument('<file>', 'Path to .xcstrings file')
        .argument('[keys...]', 'Keys to look up (or use --stdin)')
        .option('--stdin', 'Read keys from stdin: a JSON array or one key per line')
        .option('--json', 'Output as JSON')
        .action((file: string, keys: string[], options: { stdin?: boolean; json?: boolean }) => {
            if (options.stdin) {
                const raw = readStdin().trim();
                keys = raw.startsWith('[') ? (JSON.parse(raw) as string[]) : raw.split('\n').filter(Boolean);
            }
            if (keys.length === 0) {
                printError('No keys given. Pass keys as arguments or use --stdin.');
                process.exit(1);
            }

            const catalog = new StringCatalog(file);
            const result = catalog.getSourceTexts(keys);

            if (options.json) {
                printJson(result);
                return;
            }

            printTable(
                ['Key', 'Source', 'Comment'],
                result.items.map((i) => [i.key, i.source, i.comment ?? '']),
            );
            if (result.notFound.length > 0) {
                console.log(`\nNot found: ${result.notFound.map((k) => `"${k}"`).join(', ')}`);
            }
        });
}

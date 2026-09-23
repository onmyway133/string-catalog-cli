import { Command } from 'commander';
import chalk from 'chalk';
import { StringCatalog } from '../../index.js';
import { printJson, printError } from '../output.js';
import { LocalizationState } from '../../types.js';

function colorState(state: LocalizationState): string {
    switch (state) {
        case 'translated':
            return chalk.green(state);
        case 'needs_review':
            return chalk.yellow(state);
        case 'new':
            return chalk.blue(state);
        case 'stale':
            return chalk.red(state);
    }
}

export function createGetCommand(): Command {
    return new Command('get')
        .description('Get all translations for a specific key')
        .argument('<file>', 'Path to .xcstrings file')
        .argument('<key>', 'The string key to look up')
        .option('--json', 'Output as JSON')
        .action((file: string, key: string, options: { json?: boolean }) => {
            const catalog = new StringCatalog(file);
            const result = catalog.getTranslationsForKey(key);

            if (!result) {
                printError(`Key not found: "${key}"`);
                process.exit(1);
            }

            if (options.json) {
                printJson(result);
                return;
            }

            console.log(`Key:    ${chalk.bold(result.key)}`);
            if (result.sourceText !== result.key) console.log(`Source: ${result.sourceText}`);
            if (result.comment) console.log(`Comment: ${result.comment}`);
            if (result.shouldTranslate === false) console.log('shouldTranslate: false');
            if (result.extractionState === 'stale') console.log('extractionState: stale (no longer in code)');
            console.log('');

            const rows = result.translations.flatMap((t) =>
                t.pluralForms
                    ? Object.entries(t.pluralForms).map(([form, value]) => ({
                          language: `${t.language} (${form})`,
                          value: value ?? '',
                          state: t.state,
                      }))
                    : [t],
            );
            const headers = ['Language', 'Value', 'State'];
            const widths = [
                Math.max(headers[0].length, ...rows.map((r) => r.language.length)),
                Math.max(headers[1].length, ...rows.map((r) => r.value.length)),
            ];

            console.log(chalk.bold(`${headers[0].padEnd(widths[0])}  ${headers[1].padEnd(widths[1])}  ${headers[2]}`));
            console.log(`${'─'.repeat(widths[0])}  ${'─'.repeat(widths[1])}  ${'─'.repeat(12)}`);
            for (const row of rows) {
                console.log(`${row.language.padEnd(widths[0])}  ${row.value.padEnd(widths[1])}  ${colorState(row.state)}`);
            }
        });
}

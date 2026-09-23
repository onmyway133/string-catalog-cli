import { Command } from 'commander';
import * as fs from 'fs';
import { StringCatalog } from '../../index.js';
import { TranslationInput } from '../../types.js';
import { printError, printJson, readStdin } from '../output.js';

export function createUpdateCommand(): Command {
    return new Command('update')
        .description('Update translations from inline JSON, a JSON file, or "-" for stdin')
        .argument('<file>', 'Path to .xcstrings file')
        .argument('<json-or-path>', 'Inline JSON, path to a JSON file, or "-" to read stdin')
        .option('--create', 'Create keys that do not exist yet (default: skip them)')
        .option('--strict', 'Do not save if any placeholder mismatch is found')
        .option('--dry-run', 'Report what would change without saving')
        .option('--json', 'Output result as JSON')
        .action(
            (
                file: string,
                jsonOrPath: string,
                options: { create?: boolean; strict?: boolean; dryRun?: boolean; json?: boolean },
            ) => {
                let raw: string;

                if (jsonOrPath === '-') {
                    raw = readStdin();
                } else if (jsonOrPath.trimStart().startsWith('{') || jsonOrPath.trimStart().startsWith('[')) {
                    raw = jsonOrPath;
                } else {
                    if (!fs.existsSync(jsonOrPath)) {
                        printError(`File not found: "${jsonOrPath}"`);
                        process.exit(1);
                    }
                    raw = fs.readFileSync(jsonOrPath, 'utf-8');
                }

                let parsed: unknown;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    printError('Invalid JSON. Expected format: { "data": [{ "key": "...", "translations": [...] }] }');
                    process.exit(1);
                }

                // Accept both { "data": [...] } and a bare array.
                const entries = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown }).data;
                if (!Array.isArray(entries)) {
                    printError('Invalid format. Expected a top-level "data" array.');
                    process.exit(1);
                }

                const catalog = new StringCatalog(file);
                const result = catalog.updateTranslations(entries as TranslationInput[], {
                    create: options.create,
                });
                const blocked = Boolean(options.strict) && result.warnings.length > 0;
                const saved = !blocked && !options.dryRun;
                if (saved) catalog.save();

                if (options.json) {
                    printJson({
                        saved,
                        updated: result.updated.length,
                        created: result.created.length,
                        skipped: result.skipped,
                        protected: result.protected,
                        warnings: result.warnings,
                    });
                } else {
                    const verb = blocked ? 'Not saved (--strict):' : options.dryRun ? 'Dry run, would update' : 'Updated';
                    console.log(
                        `${verb} ${result.updated.length} key(s), created ${result.created.length} key(s).`,
                    );
                    if (result.skipped.length > 0) {
                        const keys = result.skipped.map((k) => JSON.stringify(k)).join(', ');
                        console.log(`Skipped ${result.skipped.length} unknown key(s) (use --create to add): ${keys}`);
                    }
                    for (const p of result.protected) {
                        console.log(
                            `Protected ${JSON.stringify(p.key)} [${p.language}]: uses device variations or substitutions, edit it in Xcode`,
                        );
                    }
                    for (const w of result.warnings) {
                        const where = w.form ? `${w.language}/${w.form}` : w.language;
                        const expected = w.expected?.join(' ') || '(none)';
                        const found = w.found?.join(' ') || '(none)';
                        console.log(`${w.kind} ${JSON.stringify(w.key)} [${where}]: expected ${expected}, found ${found}`);
                    }
                }
                if (blocked || result.skipped.length > 0 || result.protected.length > 0) process.exitCode = 1;
            },
        );
}

import * as fs from 'fs';
import * as path from 'path';
import {
    XCStrings,
    StringEntry,
    LocalizationEntry,
    TranslationInput,
    KeyTranslationsResult,
    KeyTranslation,
    LocalizationState,
    MissingTranslationResult,
    StaleKeyResult,
    SourceTextResult,
    CatalogIssue,
    IssueKind,
    UpdateResult,
    PluralForm,
} from './types.js';
import { comparePlaceholders, placeholderTokens } from './placeholders.js';

// Matches the order Xcode writes keys in, so saves don't reshuffle the file.
const xcodeKeyOrder = new Intl.Collator('en', { numeric: true }).compare;

interface FileFormat {
    // Xcode writes `"key" : value` and `{\n\n}` for empty objects; plain JSON.stringify doesn't.
    xcodeStyle: boolean;
    trailingNewline: boolean;
}

export class StringCatalog {
    private filePath: string;
    private data: XCStrings;
    private format: FileFormat;
    private createdKeys: string[] = [];

    constructor(filePath: string) {
        this.filePath = path.resolve(filePath);
        if (!fs.existsSync(this.filePath)) {
            throw new Error(`String catalog file not found: ${this.filePath}`);
        }
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content) as XCStrings;
        this.format = {
            xcodeStyle: content.includes('" : ') || !/": /.test(content),
            trailingNewline: content.endsWith('\n'),
        };
    }

    getSourceLanguage(): string {
        return this.data.sourceLanguage;
    }

    getSupportedLanguages(): string[] {
        const languages = new Set<string>();
        languages.add(this.data.sourceLanguage);

        for (const key in this.data.strings) {
            const entry = this.data.strings[key];
            if (entry.localizations) {
                for (const lang of Object.keys(entry.localizations)) {
                    languages.add(lang);
                }
            }
        }

        return Array.from(languages).sort();
    }

    getAllKeys(): string[] {
        return Object.keys(this.data.strings).sort(xcodeKeyOrder);
    }

    hasKey(key: string): boolean {
        return key in this.data.strings;
    }

    // In Xcode catalogs the key usually *is* the source text, and the source-language
    // localization is often omitted entirely. Fall back to the key in that case.
    getSourceText(key: string): string | null {
        const entry = this.data.strings[key];
        if (!entry) return null;
        const localization = entry.localizations?.[this.data.sourceLanguage];
        return valueOf(localization) ?? key;
    }

    getSourceTexts(keys: string[]): SourceTextResult {
        const items: SourceTextResult['items'] = [];
        const notFound: string[] = [];
        for (const key of keys) {
            const source = this.getSourceText(key);
            if (source === null) {
                notFound.push(key);
                continue;
            }
            const comment = this.data.strings[key].comment;
            items.push(comment ? { key, source, comment } : { key, source });
        }
        return { sourceLanguage: this.data.sourceLanguage, items, notFound };
    }

    getTranslationsForKey(key: string): KeyTranslationsResult | null {
        const entry = this.data.strings[key];
        if (!entry) {
            return null;
        }

        const translations: KeyTranslation[] = [];

        if (entry.localizations) {
            for (const [language, localization] of Object.entries(entry.localizations)) {
                if (localization.stringUnit) {
                    translations.push({
                        language,
                        value: localization.stringUnit.value,
                        state: localization.stringUnit.state,
                    });
                } else if (localization.variations?.plural) {
                    const plural = localization.variations.plural;
                    const primaryForm = plural.other || plural.one || plural.zero;
                    if (primaryForm) {
                        const pluralForms: Partial<Record<PluralForm, string>> = {};
                        for (const [form, unit] of Object.entries(plural)) {
                            if (unit?.stringUnit) pluralForms[form as PluralForm] = unit.stringUnit.value;
                        }
                        translations.push({
                            language,
                            value: primaryForm.stringUnit.value,
                            state: primaryForm.stringUnit.state,
                            pluralForms,
                        });
                    }
                }
            }
        }

        const result: KeyTranslationsResult = {
            key,
            sourceLanguage: this.data.sourceLanguage,
            sourceText: this.getSourceText(key)!,
            translations: translations.sort((a, b) => a.language.localeCompare(b.language)),
        };
        if (entry.comment) result.comment = entry.comment;
        if (entry.shouldTranslate === false) result.shouldTranslate = false;
        if (entry.extractionState) result.extractionState = entry.extractionState;
        return result;
    }

    searchKeys(query: string): string[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllKeys().filter((key) => key.toLowerCase().includes(lowerQuery));
    }

    updateTranslations(
        translations: TranslationInput[],
        options: { create?: boolean } = { create: true },
    ): UpdateResult {
        const updated: string[] = [];
        const created: string[] = [];
        const skipped: string[] = [];
        const protectedEntries: UpdateResult['protected'] = [];
        const warnings: CatalogIssue[] = [];

        for (const translation of translations) {
            const { key, translations: langTranslations, comment } = translation;
            const isNew = !this.data.strings[key];

            if (isNew) {
                // A typo'd key would otherwise silently create a junk entry.
                if (!options.create) {
                    skipped.push(key);
                    continue;
                }
                this.data.strings[key] = { extractionState: 'manual' };
                this.createdKeys.push(key);
                created.push(key);
            } else {
                updated.push(key);
            }

            const entry = this.data.strings[key];

            if (comment) {
                entry.comment = comment;
            }

            if (!entry.localizations) {
                entry.localizations = {};
            }

            // Apply the source language first so new keys validate against their own source text.
            const ordered = [...langTranslations].sort(
                (a, b) =>
                    Number(b.language === this.data.sourceLanguage) -
                    Number(a.language === this.data.sourceLanguage),
            );

            for (const langTrans of ordered) {
                if (isProtected(entry.localizations[langTrans.language])) {
                    protectedEntries.push({ key, language: langTrans.language });
                    continue;
                }
                if (langTrans.pluralForms && Object.keys(langTrans.pluralForms).length > 0) {
                    const plural: Record<
                        string,
                        { stringUnit: { state: LocalizationState; value: string } }
                    > = {};
                    for (const [form, value] of Object.entries(langTrans.pluralForms)) {
                        if (value !== undefined) {
                            plural[form] = {
                                stringUnit: {
                                    state: langTrans.state || 'translated',
                                    value,
                                },
                            };
                        }
                    }
                    entry.localizations[langTrans.language] = {
                        variations: { plural: sortedKeys(plural) },
                    };
                } else if (langTrans.value !== undefined) {
                    entry.localizations[langTrans.language] = {
                        stringUnit: {
                            state: langTrans.state || 'translated',
                            value: langTrans.value,
                        },
                    };
                } else {
                    continue;
                }

                if (langTrans.language !== this.data.sourceLanguage) {
                    const issue = this.placeholderIssue(key, langTrans.language);
                    if (issue) warnings.push(issue);
                }
            }

            // Xcode sorts every object's keys; re-sort only what we touched so the rest of the file is untouched.
            entry.localizations = sortedKeys(entry.localizations);
            this.data.strings[key] = sortedKeys(entry);
        }

        return { updated, created, skipped, protected: protectedEntries, warnings };
    }

    save(): void {
        const existing = Object.keys(this.data.strings).filter((k) => !this.createdKeys.includes(k));
        const order = [...existing];
        // Keep existing order untouched; slot new keys in where Xcode would put them.
        for (const key of [...this.createdKeys].sort(xcodeKeyOrder)) {
            const index = order.findIndex((k) => xcodeKeyOrder(k, key) > 0);
            order.splice(index === -1 ? order.length : index, 0, key);
        }

        const sortedStrings: { [key: string]: StringEntry } = {};
        for (const key of order) {
            sortedStrings[key] = this.data.strings[key];
        }
        this.data.strings = sortedStrings;
        this.createdKeys = [];

        let output = JSON.stringify(this.data, null, 2);
        if (this.format.xcodeStyle) {
            // Key lines start with a JSON string followed by ": " — string values never do.
            output = output
                .replace(/^(\s*"(?:[^"\\]|\\.)*"): /gm, '$1 : ')
                .replace(/^( *)(.*)\{\}(,?)$/gm, '$1$2{\n\n$1}$3');
        }
        if (this.format.trailingNewline) output += '\n';

        fs.writeFileSync(this.filePath, output, 'utf-8');
    }

    getStatistics(): {
        totalKeys: number;
        languages: string[];
        translationCoverage: Record<string, { translated: number; total: number; percentage: number }>;
    } {
        const detailed = this.getDetailedStatistics();
        const translationCoverage: Record<
            string,
            { translated: number; total: number; percentage: number }
        > = {};
        for (const [lang, cov] of Object.entries(detailed.translationCoverage)) {
            translationCoverage[lang] = {
                translated: cov.translated,
                total: cov.total,
                percentage: cov.percentage,
            };
        }
        return {
            totalKeys: detailed.translatableKeys,
            languages: detailed.languages,
            translationCoverage,
        };
    }

    getDetailedStatistics(): {
        totalKeys: number;
        translatableKeys: number;
        skippedKeys: number;
        languages: string[];
        translationCoverage: Record<
            string,
            {
                translated: number;
                needs_review: number;
                new: number;
                stale: number;
                total: number;
                percentage: number;
            }
        >;
    } {
        const languages = this.getSupportedLanguages();
        const allKeys = this.getAllKeys();
        // The empty key Xcode sometimes extracts has nothing to translate.
        const translatableKeys = allKeys.filter(
            (key) => key !== '' && this.data.strings[key].shouldTranslate !== false,
        );
        const skippedKeys = allKeys.length - translatableKeys.length;
        const translationCoverage: Record<
            string,
            {
                translated: number;
                needs_review: number;
                new: number;
                stale: number;
                total: number;
                percentage: number;
            }
        > = {};

        for (const lang of languages) {
            let translated = 0;
            let needs_review = 0;
            let newCount = 0;
            let stale = 0;

            for (const key of translatableKeys) {
                const localization = this.data.strings[key].localizations?.[lang];
                // An absent source-language entry means the key itself is the source text.
                const state =
                    stateOf(localization) ??
                    (lang === this.data.sourceLanguage ? 'translated' : null);
                if (state === 'translated') translated++;
                else if (state === 'needs_review') needs_review++;
                else if (state === 'new') newCount++;
                else if (state === 'stale') stale++;
            }

            const total = translatableKeys.length;
            translationCoverage[lang] = {
                translated,
                needs_review,
                new: newCount,
                stale,
                total,
                percentage: total > 0 ? Math.round((translated / total) * 100) : 0,
            };
        }

        return {
            totalKeys: allKeys.length,
            translatableKeys: translatableKeys.length,
            skippedKeys,
            languages,
            translationCoverage,
        };
    }

    // Keys whose extractionState is "stale" are no longer referenced in code, so they're
    // excluded by default — translating them is wasted work.
    getMissingTranslations(
        targetLanguage?: string,
        options: { includeStale?: boolean } = {},
    ): MissingTranslationResult[] {
        const languagesToCheck = targetLanguage
            ? [targetLanguage]
            : this.getSupportedLanguages();

        const results: MissingTranslationResult[] = [];

        for (const key of this.getAllKeys()) {
            const entry = this.data.strings[key];
            // The empty key Xcode sometimes extracts has nothing to translate.
            if (entry.shouldTranslate === false || key === '') {
                continue;
            }
            if (entry.extractionState === 'stale' && !options.includeStale) {
                continue;
            }

            const missingLanguages: string[] = [];

            for (const lang of languagesToCheck) {
                const localization = entry.localizations?.[lang];
                if (!localization && lang === this.data.sourceLanguage) {
                    continue;
                }
                if (!valueOf(localization)) {
                    missingLanguages.push(lang);
                }
            }

            if (missingLanguages.length > 0) {
                results.push({ key, missingLanguages });
            }
        }

        return results;
    }

    getStaleKeys(): StaleKeyResult[] {
        const results: StaleKeyResult[] = [];

        for (const key of this.getAllKeys()) {
            const entry = this.data.strings[key];

            if (entry.extractionState === 'stale') {
                results.push({ key, reason: 'extractionState' });
                continue;
            }

            if (entry.localizations) {
                for (const [lang, localization] of Object.entries(entry.localizations)) {
                    if (stateOf(localization) === 'stale') {
                        results.push({ key, reason: 'stringUnitState', language: lang });
                    }
                }
            }
        }

        return results;
    }

    // Every key's value in one language next to its source text, for reviewing translation quality.
    getValues(
        language: string,
        options: { compare?: string; includeStale?: boolean } = {},
    ): { key: string; source: string; value: string | null; state: LocalizationState | null; compare?: string | null }[] {
        const items = [];
        for (const key of this.getAllKeys()) {
            const entry = this.data.strings[key];
            if (entry.shouldTranslate === false || key === '') continue;
            if (entry.extractionState === 'stale' && !options.includeStale) continue;
            const localization = entry.localizations?.[language];
            const item: { key: string; source: string; value: string | null; state: LocalizationState | null; compare?: string | null } = {
                key,
                source: this.getSourceText(key)!,
                value: valueOf(localization) ?? null,
                state: stateOf(localization),
            };
            if (options.compare) item.compare = valueOf(entry.localizations?.[options.compare]) ?? null;
            items.push(item);
        }
        return items;
    }

    // Problems that show up at runtime: placeholder mismatches (crash or garbage), raw keys
    // shown instead of text, and empty values. Stale keys are gone from code, so skipped by default.
    check(options: { language?: string; includeStale?: boolean; kinds?: IssueKind[] } = {}): CatalogIssue[] {
        const issues: CatalogIssue[] = [];
        const sourceLanguage = this.data.sourceLanguage;
        for (const key of this.getAllKeys()) {
            const entry = this.data.strings[key];
            if (entry.shouldTranslate === false || key === '') continue;
            if (entry.extractionState === 'stale' && !options.includeStale) continue;

            const idKey = isIdStyleKey(key);
            // ID-style key with no source text at all: every language falls back to the raw key.
            if (idKey && !entry.localizations?.[sourceLanguage] && (!options.language || options.language === sourceLanguage)) {
                issues.push({ key, language: sourceLanguage, kind: 'raw-key', value: key });
            }

            const languages = options.language ? [options.language] : Object.keys(entry.localizations ?? {});
            for (const lang of languages.sort()) {
                const localization = entry.localizations?.[lang];
                if (!localization) continue;
                const values = allValues(localization);
                if (values.some((v) => v.value === '')) {
                    issues.push({ key, language: lang, kind: 'empty', value: '' });
                    continue;
                }
                if (idKey && values.some((v) => v.value === key)) {
                    issues.push({ key, language: lang, kind: 'raw-key', value: key });
                    continue;
                }
                if (lang !== sourceLanguage) {
                    const issue = this.placeholderIssue(key, lang);
                    if (issue) issues.push(issue);
                }
            }
        }
        return options.kinds ? issues.filter((i) => options.kinds!.includes(i.kind)) : issues;
    }

    private placeholderIssue(key: string, language: string): CatalogIssue | null {
        const source = this.getSourceText(key);
        const localization = this.data.strings[key]?.localizations?.[language];
        if (source === null || !localization) return null;

        const expected = placeholderTokens(source);
        for (const { form, value } of allValues(localization)) {
            if (!value) continue;
            // "one"/"zero" forms may legitimately drop the count ("One item").
            const mode = !form || form === 'other' ? 'exact' : 'subset';
            const kind = comparePlaceholders(source, value, mode);
            if (kind) {
                const issue: CatalogIssue = { key, language, kind, expected, found: placeholderTokens(value), value };
                if (form) issue.form = form;
                return issue;
            }
        }
        return null;
    }
}

// Keys like "settings.title" or "onProPlan" are identifiers, not text. If one of these shows up
// as a value, users see the identifier on screen. Plain words like "Settings" don't match.
function isIdStyleKey(key: string): boolean {
    return /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/.test(key) && /[._]|[a-z][A-Z]/.test(key);
}

function isProtected(localization: LocalizationEntry | undefined): boolean {
    return Boolean(localization?.variations?.device || (localization as { substitutions?: unknown })?.substitutions);
}

function allValues(localization: LocalizationEntry): { form?: PluralForm; value: string }[] {
    if (localization.stringUnit) return [{ value: localization.stringUnit.value }];
    return Object.entries(localization.variations?.plural ?? {})
        .filter(([, unit]) => unit?.stringUnit)
        .map(([form, unit]) => ({ form: form as PluralForm, value: unit!.stringUnit.value }));
}

function sortedKeys<T extends object>(obj: T): T {
    const sorted = {} as T;
    for (const key of Object.keys(obj).sort(xcodeKeyOrder)) {
        (sorted as Record<string, unknown>)[key] = (obj as Record<string, unknown>)[key];
    }
    return sorted;
}

function valueOf(localization: LocalizationEntry | undefined): string | undefined {
    if (localization?.stringUnit) return localization.stringUnit.value || undefined;
    const plural = localization?.variations?.plural;
    return (plural?.other ?? plural?.one ?? plural?.zero)?.stringUnit?.value || undefined;
}

function stateOf(localization: LocalizationEntry | undefined): LocalizationState | null {
    if (localization?.stringUnit) return localization.stringUnit.state;
    return localization?.variations?.plural?.other?.stringUnit?.state ?? null;
}

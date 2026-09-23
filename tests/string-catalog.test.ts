import { test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StringCatalog, placeholdersMatch } from '../src/index.js';

const FIXTURE_PATH = path.join(import.meta.dir, 'fixtures/sample.xcstrings');

let tmpFile: string;

beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `xcstrings-test-${Date.now()}.xcstrings`);
    fs.copyFileSync(FIXTURE_PATH, tmpFile);
});

afterEach(() => {
    if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
    }
});

test('getSourceLanguage returns en', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    expect(catalog.getSourceLanguage()).toBe('en');
});

test('getSupportedLanguages returns sorted unique languages', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    expect(catalog.getSupportedLanguages()).toEqual(['de', 'en']);
});

test('getAllKeys returns all keys sorted', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    expect(catalog.getAllKeys()).toEqual(['Cancel', 'Hello %@', 'Settings']);
});

test('getMissingTranslations finds key missing German', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    const missing = catalog.getMissingTranslations('de');
    expect(missing).toHaveLength(1);
    expect(missing[0].key).toBe('Hello %@');
    expect(missing[0].missingLanguages).toContain('de');
});

test('getMissingTranslations with no language returns all missing', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    const missing = catalog.getMissingTranslations();
    expect(missing.length).toBeGreaterThan(0);
});

test('getTranslationsForKey returns translations for Cancel', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    const result = catalog.getTranslationsForKey('Cancel');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('Cancel');
    expect(result!.translations).toHaveLength(2);
    const de = result!.translations.find((t) => t.language === 'de');
    expect(de?.value).toBe('Abbrechen');
    expect(de?.state).toBe('translated');
});

test('getTranslationsForKey returns null for unknown key', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    expect(catalog.getTranslationsForKey('nonexistent')).toBeNull();
});

test('searchKeys finds matching keys case-insensitively', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    expect(catalog.searchKeys('hello')).toEqual(['Hello %@']);
    expect(catalog.searchKeys('CANCEL')).toEqual(['Cancel']);
    expect(catalog.searchKeys('xyz')).toEqual([]);
});

test('updateTranslations creates new key and updates existing', () => {
    const catalog = new StringCatalog(tmpFile);

    const result = catalog.updateTranslations([
        {
            key: 'Hello %@',
            translations: [{ language: 'de', value: 'Hallo %@' }],
        },
        {
            key: 'New Key',
            translations: [{ language: 'en', value: 'New Value' }],
        },
    ]);

    expect(result.updated).toContain('Hello %@');
    expect(result.created).toContain('New Key');
});

test('save writes valid JSON and can be reloaded', () => {
    const catalog = new StringCatalog(tmpFile);
    catalog.updateTranslations([
        { key: 'Hello %@', translations: [{ language: 'de', value: 'Hallo %@' }] },
    ]);
    catalog.save();

    const reloaded = new StringCatalog(tmpFile);
    const result = reloaded.getTranslationsForKey('Hello %@');
    expect(result?.translations.find((t) => t.language === 'de')?.value).toBe('Hallo %@');
});

test('getStatistics reports correct coverage', () => {
    const catalog = new StringCatalog(FIXTURE_PATH);
    const stats = catalog.getStatistics();
    expect(stats.totalKeys).toBe(3);
    expect(stats.languages).toContain('en');
    expect(stats.languages).toContain('de');
    // de is missing one translation
    expect(stats.translationCoverage['de'].translated).toBeLessThan(stats.totalKeys);
    expect(stats.translationCoverage['en'].translated).toBe(3);
});

test('throws for missing file', () => {
    expect(() => new StringCatalog('/nonexistent/path.xcstrings')).toThrow();
});

// Xcode-formatted catalog: " : " separators, {\n\n} empty objects, no trailing newline,
// a key with no source-language entry, a stale key, and a placeholder bug.
const XCODE_CATALOG = `{
  "sourceLanguage" : "en",
  "strings" : {
    "" : {

    },
    "• %@" : {
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "• %@"
          }
        }
      }
    },
    "Delete %@?" : {
      "comment" : "Confirm deletion",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Löschen?"
          }
        }
      }
    },
    "Old label" : {
      "extractionState" : "stale"
    },
    "Save" : {

    }
  },
  "version" : "1.0"
}`;

let xcodeFile: string;

beforeEach(() => {
    xcodeFile = path.join(os.tmpdir(), `xcstrings-xcode-${Date.now()}.xcstrings`);
    fs.writeFileSync(xcodeFile, XCODE_CATALOG);
});

afterEach(() => {
    if (fs.existsSync(xcodeFile)) fs.unlinkSync(xcodeFile);
});

test('save without changes preserves Xcode formatting byte-for-byte', () => {
    new StringCatalog(xcodeFile).save();
    expect(fs.readFileSync(xcodeFile, 'utf-8')).toBe(XCODE_CATALOG);
});

test('save keeps plain JSON style and trailing newline for non-Xcode files', () => {
    const before = fs.readFileSync(tmpFile, 'utf-8');
    new StringCatalog(tmpFile).save();
    expect(fs.readFileSync(tmpFile, 'utf-8')).toBe(before);
});

test('new keys are inserted in Xcode order without reordering existing keys', () => {
    const catalog = new StringCatalog(xcodeFile);
    catalog.updateTranslations([{ key: 'Add', translations: [{ language: 'de', value: 'Hinzufügen' }] }]);
    catalog.save();
    const keys = Object.keys(JSON.parse(fs.readFileSync(xcodeFile, 'utf-8')).strings);
    expect(keys).toEqual(['', '• %@', 'Add', 'Delete %@?', 'Old label', 'Save']);
});

test('source text falls back to the key when the source language entry is absent', () => {
    const catalog = new StringCatalog(xcodeFile);
    expect(catalog.getSourceText('Save')).toBe('Save');
    expect(catalog.getSourceTexts(['Delete %@?', 'nope'])).toEqual({
        sourceLanguage: 'en',
        items: [{ key: 'Delete %@?', source: 'Delete %@?', comment: 'Confirm deletion' }],
        notFound: ['nope'],
    });
});

test('missing ignores implicit source text, the empty key, and stale keys', () => {
    const catalog = new StringCatalog(xcodeFile);
    expect(catalog.getMissingTranslations().map((m) => m.key)).toEqual(['Save']);
    expect(catalog.getMissingTranslations('de', { includeStale: true }).map((m) => m.key)).toEqual([
        'Old label',
        'Save',
    ]);
});

test('check reports dropped placeholders', () => {
    const issues = new StringCatalog(xcodeFile).check();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
        key: 'Delete %@?',
        language: 'de',
        kind: 'missing-placeholder',
        expected: ['%@'],
        found: [],
    });
});

test('check finds raw keys, empty values, and classifies placeholder problems', () => {
    const catalog = new StringCatalog(xcodeFile);
    catalog.updateTranslations(
        [
            { key: 'settings.title', translations: [{ language: 'de', value: 'settings.title' }] },
            { key: 'onProPlan', translations: [{ language: 'en', value: 'You are on Pro' }, { language: 'fr', value: '' }] },
            { key: 'Thanks', translations: [{ language: 'tr', value: 'Teşekkürler %@' }] },
            { key: 'Thanks for using %@', translations: [{ language: 'pl', value: 'Dzięki za używanie @%.' }] },
            { key: '%lld days', translations: [{ language: 'de', value: '%d Tage' }] },
        ],
        { create: true },
    );
    const byKey = Object.fromEntries(catalog.check().map((i) => [`${i.key}/${i.language}`, i.kind]));
    expect(byKey['settings.title/en']).toBe('raw-key');
    expect(byKey['settings.title/de']).toBe('raw-key');
    expect(byKey['onProPlan/fr']).toBe('empty');
    expect(byKey['onProPlan/en']).toBeUndefined();
    expect(byKey['Thanks/tr']).toBe('extra-placeholder');
    expect(byKey['Thanks for using %@/pl']).toBe('malformed-placeholder');
    expect(byKey['%lld days/de']).toBe('wrong-placeholder-type');
});

test('updateTranslations refuses to overwrite device variations and substitutions', () => {
    const catalog = new StringCatalog(xcodeFile);
    const data = JSON.parse(fs.readFileSync(xcodeFile, 'utf-8'));
    data.strings['Save'] = { localizations: { de: { variations: { device: { mac: { stringUnit: { state: 'translated', value: 'Sichern' } } } } } } };
    fs.writeFileSync(xcodeFile, JSON.stringify(data));
    const result = new StringCatalog(xcodeFile).updateTranslations([
        { key: 'Save', translations: [{ language: 'de', value: 'Speichern' }, { language: 'fr', value: 'Enregistrer' }] },
    ]);
    expect(result.protected).toEqual([{ key: 'Save', language: 'de' }]);
    expect(catalog).toBeDefined();
});

test('updateTranslations skips unknown keys unless create is set', () => {
    const catalog = new StringCatalog(xcodeFile);
    const result = catalog.updateTranslations(
        [{ key: 'Typo', translations: [{ language: 'de', value: 'x' }] }],
        { create: false },
    );
    expect(result.skipped).toEqual(['Typo']);
    expect(catalog.hasKey('Typo')).toBe(false);
});

test('updateTranslations warns on placeholder mismatch, allows plural one-form to drop count', () => {
    const catalog = new StringCatalog(xcodeFile);
    const result = catalog.updateTranslations([
        { key: 'Delete %@?', translations: [{ language: 'fr', value: 'Supprimer ?' }] },
        {
            key: '%lld items',
            translations: [
                { language: 'en', pluralForms: { one: '%lld item', other: '%lld items' } },
                { language: 'de', pluralForms: { one: 'Ein Element', other: '%lld Elemente' } },
            ],
        },
    ]);
    expect(result.warnings.map((w) => `${w.key}/${w.language}`)).toEqual(['Delete %@?/fr']);
});

test('placeholder parsing treats positional and sequential specifiers as equivalent', () => {
    expect(placeholdersMatch('%@ has %lld items', '%2$lld Elemente bei %1$@', 'exact')).toBe(true);
    expect(placeholdersMatch('%@ has %lld items', '%1$@ hat %2$d Elemente', 'exact')).toBe(false);
    expect(placeholdersMatch('100% free', '100 % kostenlos', 'exact')).toBe(true);
    expect(placeholdersMatch('%d%%', '%d %%', 'exact')).toBe(true);
});

test('getValues lists source and value per key, skipping stale and empty keys', () => {
    const values = new StringCatalog(xcodeFile).getValues('de', { compare: 'fr' });
    expect(values).toEqual([
        { key: '• %@', source: '• %@', value: '• %@', state: 'translated', compare: null },
        { key: 'Delete %@?', source: 'Delete %@?', value: 'Löschen?', state: 'translated', compare: null },
        { key: 'Save', source: 'Save', value: null, state: null, compare: null },
    ]);
});

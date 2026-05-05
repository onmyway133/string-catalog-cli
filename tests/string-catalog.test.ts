import { test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StringCatalog } from '../src/index.js';

const FIXTURE_PATH = path.join(import.meta.dir, 'fixtures/sample.xcstrings');

let tmpFile: string;

beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `scat-test-${Date.now()}.xcstrings`);
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

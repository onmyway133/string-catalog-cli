export type LocalizationState = 'new' | 'translated' | 'needs_review' | 'stale';

export interface StringUnit {
    state: LocalizationState;
    value: string;
}

export interface LocalizationEntry {
    stringUnit?: StringUnit;
    variations?: {
        plural?: {
            zero?: { stringUnit: StringUnit };
            one?: { stringUnit: StringUnit };
            two?: { stringUnit: StringUnit };
            few?: { stringUnit: StringUnit };
            many?: { stringUnit: StringUnit };
            other?: { stringUnit: StringUnit };
        };
        device?: Record<string, { stringUnit: StringUnit }>;
    };
}

export interface StringLocalizations {
    [languageCode: string]: LocalizationEntry;
}

export interface StringEntry {
    comment?: string;
    extractionState?: 'manual' | 'extracted_with_value' | 'stale' | 'migrated' | 'ucheck';
    shouldTranslate?: boolean;
    localizations?: StringLocalizations;
}

export interface XCStrings {
    sourceLanguage: string;
    version?: string;
    strings: {
        [key: string]: StringEntry;
    };
}

export type PluralForm = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export interface TranslationInput {
    key: string;
    translations: {
        language: string;
        value?: string;
        pluralForms?: Partial<Record<PluralForm, string>>;
        state?: LocalizationState;
    }[];
    comment?: string;
}

export interface TranslationData {
    data: TranslationInput[];
}

export interface KeyTranslation {
    language: string;
    value: string;
    state: LocalizationState;
    pluralForms?: Partial<Record<PluralForm, string>>;
}

export interface KeyTranslationsResult {
    key: string;
    sourceLanguage: string;
    sourceText: string;
    comment?: string;
    shouldTranslate?: false;
    extractionState?: StringEntry['extractionState'];
    translations: KeyTranslation[];
}

export interface SourceTextResult {
    sourceLanguage: string;
    items: { key: string; source: string; comment?: string }[];
    notFound: string[];
}

export type IssueKind =
    | 'extra-placeholder'
    | 'wrong-placeholder-type'
    | 'malformed-placeholder'
    | 'missing-placeholder'
    | 'raw-key'
    | 'empty';

export interface CatalogIssue {
    key: string;
    language: string;
    kind: IssueKind;
    form?: PluralForm;
    expected?: string[];
    found?: string[];
    value: string;
}

export interface UpdateResult {
    updated: string[];
    created: string[];
    skipped: string[];
    // Localizations using device variations or substitutions, which update would destroy.
    protected: { key: string; language: string }[];
    warnings: CatalogIssue[];
}

export interface MissingTranslationResult {
    key: string;
    missingLanguages: string[];
}

export interface StaleKeyResult {
    key: string;
    reason: 'extractionState' | 'stringUnitState';
    language?: string;
}

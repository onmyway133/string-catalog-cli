// Format specifier parsing for iOS/printf-style strings (%@, %d, %lld, %1$@, %.2f, ...).
// Used to catch translations whose placeholders don't match the source, which crash at runtime.

const SPECIFIER =
    /%(?:(\d+)\$)?[-+0#]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(hh|h|ll|l|q|L|z|t|j)?([@dDiuUxXoOfFeEgGaAcCsSp])|%%/g;

export type PlaceholderProblem =
    | 'extra-placeholder'
    | 'wrong-placeholder-type'
    | 'malformed-placeholder'
    | 'missing-placeholder';

// Map of argument position -> normalized type (length modifier + conversion).
// Non-positional specifiers take implicit positions 1, 2, 3... in order, so
// "%@ %@" and "%2$@ %1$@" are considered equivalent.
export function parsePlaceholders(text: string): Map<number, string> {
    const result = new Map<number, string>();
    let implicit = 0;
    for (const match of text.matchAll(SPECIFIER)) {
        if (match[0] === '%%') continue;
        const position = match[1] ? parseInt(match[1], 10) : ++implicit;
        const length = match[2] === 'q' ? 'll' : (match[2] ?? '');
        let conversion = match[3];
        if (conversion === 'i') conversion = 'd';
        if (conversion === 'F') conversion = 'f';
        result.set(position, length + conversion);
    }
    return result;
}

// The specifiers as written, for human-readable reports.
export function placeholderTokens(text: string): string[] {
    return [...text.matchAll(SPECIFIER)].map((m) => m[0]).filter((t) => t !== '%%');
}

// exact: translation must use every source argument (singular strings, plural "other").
// subset: translation may drop arguments but not add or retype any (plural "one", "zero", ...).
export function comparePlaceholders(
    source: string,
    translation: string,
    mode: 'exact' | 'subset',
): PlaceholderProblem | null {
    const expected = parsePlaceholders(source);
    const found = parsePlaceholders(translation);
    for (const [pos, type] of found) {
        // Reads an argument the app never passes: garbage output or a crash.
        if (!expected.has(pos)) return 'extra-placeholder';
        // e.g. %d for an Int64 argument: wrong value or a crash.
        if (expected.get(pos) !== type) return 'wrong-placeholder-type';
    }
    // A stray % left over (e.g. "@%" typed instead of "%@") that the source doesn't have.
    if (strayPercents(translation) > strayPercents(source)) return 'malformed-placeholder';
    if (mode === 'exact' && found.size !== expected.size) return 'missing-placeholder';
    return null;
}

export function placeholdersMatch(source: string, translation: string, mode: 'exact' | 'subset'): boolean {
    return comparePlaceholders(source, translation, mode) === null;
}

function strayPercents(text: string): number {
    return (text.replace(SPECIFIER, '').match(/%/g) ?? []).length;
}

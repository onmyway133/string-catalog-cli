# string-catalog-cli

CLI for managing Xcode String Catalog (`.xcstrings`) files. Query, inspect, and update translations from the terminal.

## Install

Install locally from source — this links the `xcstrings` command globally:

```sh
git clone https://github.com/onmyway133/string-catalog-cli.git
cd string-catalog-cli
bun install
bun run build
bun link
```

After pulling changes, re-run `bun run build` to update the linked command.

Or install from npm:

```sh
npm install -g string-catalog-cli
```

## Commands

All commands take a path to an `.xcstrings` file as the first argument. Add `--json` to any read command for compact, machine-readable output (single line, no pretty-printing, so it stays cheap for AI agents to read).

Writes preserve the file's existing formatting (Xcode's `"key" : value` style, key order, trailing newline), so `git diff` only shows what actually changed.

In Xcode catalogs the key is usually the source text and the source-language entry is often omitted. The CLI treats such keys as having the key itself as source text, so they don't show up as "missing" in the source language.

### `xcstrings languages <file>`

List all languages with translation coverage.

### `xcstrings stats <file>`

Detailed statistics broken down by state (translated, needs_review, new, stale).

### `xcstrings keys <file>`

List all string keys. Paginated with `--limit` (default 100) and `--offset`.

### `xcstrings search <file> <query>`

Case-insensitive substring search over key names.

### `xcstrings get <file> <key>`

Show source text, comment, and all translations (including every plural form) for one key. Use `--` before keys starting with `-`, with all options before it: `xcstrings get App.xcstrings --json -- "-foo"`.

### `xcstrings source <file> [keys...]`

Source text and comment for many keys in one call. Use `--stdin` to pass a JSON array or one key per line.

```sh
xcstrings source App.xcstrings "Cancel" "Delete %@?" --json
jq -c '[.items[].key]' page.json | xcstrings source App.xcstrings --stdin --json
```

### `xcstrings values <file> --language <lang>`

Every key with its source text and value in one language, for reviewing translation quality. Add `--compare <lang>` to show a second language next to it. Skips stale keys unless `--include-stale`. Paginated with `--limit` (default 100) and `--offset`.

```sh
xcstrings values App.xcstrings --language pl --compare de --limit 50 --json
```

### `xcstrings missing <file>`

List keys with missing translations. Skips `shouldTranslate: false` keys and keys Xcode marked stale (no longer in code, use `--include-stale` to include them). Paginated with `--limit` (default 100) and `--offset`.

```sh
xcstrings missing App.xcstrings --language de --with-source --limit 50 --json
# {"total":71,"offset":0,"limit":50,"hasMore":true,"items":[{"key":"Delete %@?","source":"Delete %@?","comment":"Confirm deletion"}, ...]}
```

`--with-source` includes the source text and comment, which is everything needed to translate a batch in one call.

### `xcstrings stale <file>`

List keys marked stale by Xcode's extraction state or by translation state.

### `xcstrings check <file>`

Find translations that break at runtime. Each issue has a `kind`:

| kind | Meaning |
|---|---|
| `extra-placeholder` | Translation reads an argument the source doesn't have (garbage or crash) |
| `wrong-placeholder-type` | e.g. `%d` where the source has `%lld` |
| `malformed-placeholder` | Stray `%`, e.g. `@%` typed instead of `%@` |
| `missing-placeholder` | Translation drops a placeholder |
| `raw-key` | An ID-style key (`settings.title`, `onProPlan`) shows up as the value, or has no source text at all |
| `empty` | Empty value |

Positional and sequential specifiers are treated as equivalent (`%@ %lld` matches `%2$lld %1$@`), and plural `one`/`zero` forms may drop the count. Stale keys are skipped unless `--include-stale`. Filter with `--language` and `--kind`. Exits with code 1 when issues are found.

```sh
xcstrings check App.xcstrings --json --limit 0          # just the counts per kind
xcstrings check App.xcstrings --language de --kind raw-key,empty
```

### `xcstrings update <file> <json-or-path>`

Update translations from inline JSON, a JSON file, or `-` for stdin.

```sh
xcstrings update App.xcstrings translations.json
xcstrings update App.xcstrings - < translations.json
xcstrings update App.xcstrings '{"data":[{"key":"Cancel","translations":[{"language":"de","value":"Abbrechen"}]}]}'
```

- Unknown keys are skipped (a typo would otherwise create a junk key). Pass `--create` to add new keys.
- Every written translation is checked against the source placeholders and mismatches are reported. `--strict` refuses to save if any are found.
- Localizations using device variations or substitutions are protected: `update` refuses to overwrite them (it would destroy them) and reports them.
- `--dry-run` reports what would change without saving.
- Exits with code 1 if keys were skipped or protected, or `--strict` blocked the save.

**JSON format** (a bare array without the `data` wrapper also works):

```json
{
  "data": [
    {
      "key": "Hello %@",
      "translations": [
        { "language": "de", "value": "Hallo %@" },
        { "language": "fr", "value": "Bonjour %@", "state": "needs_review" }
      ],
      "comment": "Greeting with user name"
    }
  ]
}
```

`state` defaults to `translated`. For plural strings, use `pluralForms` instead of `value`:

```json
{
  "data": [
    {
      "key": "%lld items",
      "translations": [
        {
          "language": "de",
          "pluralForms": {
            "one": "%lld Element",
            "other": "%lld Elemente"
          }
        }
      ]
    }
  ]
}
```

## iOS Format Placeholders

Preserve these in all translations:

| Placeholder | Meaning |
|-------------|---------|
| `%@` | String / object |
| `%d`, `%lld` | Integer |
| `%f` | Float |
| `%1$@`, `%2$@` | Positional (order can change per language) |

## Build from source

```sh
bun install
bun run build
node dist/cli/index.js --help
```

## Test

```sh
bun test
```

## Related

- [super-use-xcstrings](https://github.com/onmyway133/private-skills/tree/main/skills/super-use-xcstrings) — Claude Code skill that teaches agents to use this CLI

# string-catalog-cli

CLI for managing Xcode String Catalog (`.xcstrings`) files. Query, inspect, and update translations from the terminal.

## Install

```sh
npm install -g string-catalog-cli
# or
bun add -g string-catalog-cli
```

## Commands

All commands take a path to an `.xcstrings` file as the first argument. Add `--json` to any command for machine-readable output.

### `scat languages <file>`

List all languages with translation coverage.

```sh
scat languages App.xcstrings
```

### `scat stats <file>`

Detailed statistics broken down by state (translated, needs_review, new, stale).

```sh
scat stats App.xcstrings
scat stats App.xcstrings --json
```

### `scat keys <file>`

List all string keys. Supports pagination.

```sh
scat keys App.xcstrings
scat keys App.xcstrings --limit 50 --offset 0
```

### `scat search <file> <query>`

Case-insensitive substring search over key names.

```sh
scat search App.xcstrings "button"
```

### `scat get <file> <key>`

Show all translations for a specific key with their states.

```sh
scat get App.xcstrings "Cancel"
scat get App.xcstrings "Cancel" --json
```

### `scat missing <file>`

List keys with missing translations, optionally filtered to one language.

```sh
scat missing App.xcstrings
scat missing App.xcstrings --language de
scat missing App.xcstrings --language de --json
```

### `scat stale <file>`

List keys marked stale by Xcode's extraction state or by translation state.

```sh
scat stale App.xcstrings
```

### `scat update <file> <json-or-path>`

Update translations from an inline JSON string or a path to a JSON file.

```sh
scat update App.xcstrings translations.json
scat update App.xcstrings '{"data":[{"key":"Cancel","translations":[{"language":"de","value":"Abbrechen"}]}]}'
```

**JSON format:**

```json
{
  "data": [
    {
      "key": "Hello %@",
      "translations": [
        { "language": "de", "value": "Hallo %@" },
        { "language": "fr", "value": "Bonjour %@" }
      ],
      "comment": "Greeting with user name"
    }
  ]
}
```

For plural strings, use `pluralForms` instead of `value`:

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

- [string-catalog-mcp](https://github.com/onmyway133/string-catalog-mcp) — MCP server that wraps this library for use with Claude and other AI tools

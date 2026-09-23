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

All commands take a path to an `.xcstrings` file as the first argument. Add `--json` to any command for machine-readable output.

### `xcstrings languages <file>`

List all languages with translation coverage.

```sh
xcstrings languages App.xcstrings
```

### `xcstrings stats <file>`

Detailed statistics broken down by state (translated, needs_review, new, stale).

```sh
xcstrings stats App.xcstrings
xcstrings stats App.xcstrings --json
```

### `xcstrings keys <file>`

List all string keys. Supports pagination.

```sh
xcstrings keys App.xcstrings
xcstrings keys App.xcstrings --limit 50 --offset 0
```

### `xcstrings search <file> <query>`

Case-insensitive substring search over key names.

```sh
xcstrings search App.xcstrings "button"
```

### `xcstrings get <file> <key>`

Show all translations for a specific key with their states.

```sh
xcstrings get App.xcstrings "Cancel"
xcstrings get App.xcstrings "Cancel" --json
```

### `xcstrings missing <file>`

List keys with missing translations, optionally filtered to one language.

```sh
xcstrings missing App.xcstrings
xcstrings missing App.xcstrings --language de
xcstrings missing App.xcstrings --language de --json
```

### `xcstrings stale <file>`

List keys marked stale by Xcode's extraction state or by translation state.

```sh
xcstrings stale App.xcstrings
```

### `xcstrings update <file> <json-or-path>`

Update translations from an inline JSON string or a path to a JSON file.

```sh
xcstrings update App.xcstrings translations.json
xcstrings update App.xcstrings '{"data":[{"key":"Cancel","translations":[{"language":"de","value":"Abbrechen"}]}]}'
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

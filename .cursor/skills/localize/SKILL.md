---
name: localize
description: Localize ryOS apps and components by extracting hardcoded strings, replacing with translation keys, and syncing across languages. Use when localizing an app, adding i18n support, translating UI text, or working with translation files.
---

# Localize App or Component

## Workflow Checklist

```
- [ ] 1. Extract hardcoded strings
- [ ] 2. Replace with t() calls in source files
- [ ] 3. Add English translations to en/translation.json
- [ ] 4. Sync translations across languages
- [ ] 5. Machine translate [TODO] keys
- [ ] 6. Validate coverage and terminology
```

## Step 1: Extract Hardcoded Strings

```bash
bun run i18n:extract --dir=src/apps/[app]
bun run i18n:extract --pattern [PATTERN]
bun run i18n:extract --exclude=test,spec
```

## Step 2: Replace Strings with t() Calls

For each component:
1. Add import: `import { useTranslation } from "react-i18next";`
2. Add hook: `const { t } = useTranslation();`
3. Replace strings: `t("apps.[appName].category.key")`
4. Add `t` to dependency arrays for `useMemo`/`useCallback`

### Key Structure

```
apps.[appName].menu.*        # Menu labels
apps.[appName].dialogs.*     # Dialog titles/descriptions
apps.[appName].status.*      # Status messages
apps.[appName].ariaLabels.*  # Accessibility labels
apps.[appName].help.*        # Help items (auto-translated)
apps.[appName].speech.*      # Spoken feedback / speech labels
apps.[appName].conversion.*  # Unit conversion labels
apps.[appName].angle.*       # Angle-mode labels
common.auth.*                # Shared login/signup/recovery dialog labels
```

### Common Patterns

```tsx
// Basic
t("apps.ipod.menu.file")

// With variables
t("apps.ipod.status.trackCount", { count: 5 })

// Conditional
isPlaying ? t("pause") : t("play")

// With symbol prefix
`✓ ${t("apps.ipod.menu.shuffle")}`
```

## Step 3: Add English Translations

Add to `src/lib/locales/en/translation.json`:

```json
{
  "apps": {
    "ipod": {
      "menu": { "file": "File", "addSong": "Add Song..." },
      "dialogs": { "clearLibraryTitle": "Clear Library" },
      "status": { "shuffleOn": "Shuffle ON" }
    }
  }
}
```

Do not rely on `defaultValue` as the only copy of a new key. `t("some.key", { defaultValue: "English" })` renders, but sync and audit scripts only compare locale JSON files, so missing keys stay invisible until the English catalog contains them.

## Step 4: Sync Across Languages

```bash
bun run i18n:sync
bun run i18n:sync:mark-todo
```

`i18n:sync` adds missing keys using English copy. `i18n:sync:mark-todo` adds missing keys to all 10 language files, marked with `[TODO]`.

## Step 5: Machine Translate

```bash
bun run i18n:translate
bun run i18n:translate --lang ja
bun run i18n:translate --batch-size=10
bun run i18n:translate:dry-run
```

Requires `GOOGLE_GENERATIVE_AI_API_KEY` env variable.

## Step 6: Validate

```bash
bun run i18n:sync:dry-run
bun run i18n:audit
bun test tests/test-translation-audit.test.ts
bun run i18n:find-untranslated
```

Use `bun run i18n:audit:fix` only for missing/obsolete keys, required translation overrides, plural backfills, and terminology drift the script can safely repair, then rerun `bun run i18n:audit`.

## Component Guidelines

| Component | What to translate |
|-----------|-------------------|
| Menu bars | All labels, items, submenus |
| Dialogs | Titles, descriptions, button labels |
| Status | `showStatus()` calls, toasts |
| Help items | Auto-translated via `useTranslatedHelpItems` |
| Shared auth dialogs | `common.auth.*`, for login/signup/password recovery copy |

## Notes

- Emoji/symbols (♪, ✓) can stay hardcoded
- Refresh Apple glossary data with `bun run i18n:apple-glossary` only when the AppleGlot glossary source files change. The audit, audit fix, and machine-translation prompt all use this terminology data.
- Help items use pattern: `apps.[appName].help.[key].title/description`
- Help item key order lives in `src/hooks/useTranslatedHelpItems.ts`; apps with longer localized help rows can export their key list (for example `src/apps/maps/helpKeys.ts`, `src/apps/calculator/helpKeys.ts`, or `src/apps/internet-explorer/helpKeys.ts`) and spread it into `APP_HELP_I18N_KEYS`
- `tests/test-help-i18n-alignment.test.ts` covers every registered app; update it only if the global help-key contract changes
- Include `t` in dependency arrays when used in `useMemo`/`useCallback`

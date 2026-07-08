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
bun run i18n:extract --pattern [PATTERN]
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
apps.[appName].toasts.*      # Toast titles/descriptions
apps.[appName].empty.*       # Empty-state titles/hints
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

Use Apple-style title casing for standalone English menu and control labels, such as `Repeat All`, `Repeat One`, `Sign In`, and `Main Volume`. When a casing or terminology rule should be enforced globally, add the key to `ENGLISH_STYLE_EXPECTATIONS` in `scripts/apple-ui-terminology.ts` and cover it with `tests/unit/i18n/test-translation-audit.test.ts`.

## Step 4: Sync Across Languages

```bash
bun run i18n:sync:mark-todo
```

Adds missing keys to all 11 language files, marked with `[TODO]`.

## Step 5: Machine Translate

```bash
bun run i18n:translate
```

Requires `GOOGLE_GENERATIVE_AI_API_KEY` env variable.

## Step 6: Validate

```bash
bun run i18n:sync:dry-run
bun run i18n:audit
bun run i18n:find-untranslated
```

Use `bun run i18n:audit:fix` only for terminology drift the script can safely repair, then rerun `bun run i18n:audit`. When audit reports glossary mismatches that are not auto-fixable, edit the affected locale JSON values by hand and rerun the audit.

## Component Guidelines

| Component | What to translate |
|-----------|-------------------|
| Menu bars | All labels, items, submenus |
| Dialogs | Titles, descriptions, button labels |
| Status | `showStatus()` calls and inline state labels |
| Toasts / empty states | Sonner toast copy, empty-state titles, empty-state hints |
| Help items | Auto-translated via `useTranslatedHelpItems` |
| Shared auth dialogs | `common.auth.*`, for login/signup/password recovery copy |

## Notes

- Emoji/symbols (♪, ✓) can stay hardcoded
- Help items use pattern: `apps.[appName].help.[key].title/description`
- Help item key order lives in `src/hooks/useTranslatedHelpItems.ts`; apps with longer localized help rows can export their key list (for example `src/apps/maps/helpKeys.ts`, `src/apps/calculator/helpKeys.ts`, or `src/apps/internet-explorer/helpKeys.ts`) and spread it into `APP_HELP_I18N_KEYS`
- `tests/unit/i18n/test-help-i18n-alignment.test.ts` covers every registered app; update it only if the global help-key contract changes
- Include `t` in dependency arrays when used in `useMemo`/`useCallback`
- If Apple terminology changes upstream, refresh the glossary source with `bun run i18n:apple-glossary` before auditing locale copy

# Localize Command

Complete localization workflow for an app or component. This command guides the agent through extracting hardcoded strings, adding translation keys, syncing translations, machine translating, and replacing hardcoded strings in source code.

## Usage
`/localize [app-name]` or `/localize [component-path]`

Examples:
- `/localize ipod` - Localize the entire iPod app
- `/localize MenuBar` - Localize MenuBar component
- `/localize src/apps/finder` - Localize Finder app

## Workflow Steps

### Step 1: Extract Hardcoded Strings
Run the extraction script to identify hardcoded strings:
```bash
bun run scripts/extract-strings.ts --pattern [PATTERN]
```

The script will output suggested translation keys and their locations. Review the output to understand what strings need translation.

### Step 2: Add Translation Keys to English File
Manually add the extracted strings as translation keys to `src/lib/locales/en/translation.json`.

**Key Structure:**
- Use hierarchical keys: `apps.[appName].category.keyName`
- Group related keys logically (e.g., `menu`, `dialogs`, `status`, `ariaLabels`, `menuItems`)
- Use descriptive, consistent naming

**Example structure:**
```json
{
  "apps": {
    "ipod": {
      "menu": {
        "file": "File",
        "controls": "Controls",
        "addSong": "Add Song..."
      },
      "dialogs": {
        "clearLibraryTitle": "Clear Library",
        "clearLibraryDescription": "Are you sure..."
      },
      "status": {
        "shuffleOn": "Shuffle ON",
        "shuffleOff": "Shuffle OFF"
      }
    }
  }
}
```

### Step 3: Sync Translation Keys Across Languages
After adding keys to English, sync them to other language files:
```bash
bun run scripts/sync-translations.ts --mark-untranslated
```

This will:
- Add missing keys to all language files
- Mark new keys with `[TODO]` for machine translation
- Preserve existing translations

### Step 4: Machine Translate [TODO] Keys
Translate all `[TODO]` marked keys using the Gemini API:
```bash
bun run scripts/machine-translate.ts
```

**Requirements:**
- `GOOGLE_GENERATIVE_AI_API_KEY` environment variable must be set
- The script will translate all `[TODO]` keys in all language files

### Step 5: Replace Hardcoded Strings in Source Code
Replace all hardcoded strings in the source files with `t()` function calls.

**For each component file:**
1. Add import: `import { useTranslation } from "react-i18next";`
2. Add hook call: `const { t } = useTranslation();` at the top of the component
3. Replace hardcoded strings with `t("translation.key.path")`
4. Update `useMemo` and `useCallback` dependency arrays to include `t` where needed

**Common patterns:**
- Menu labels: `t("apps.ipod.menu.file")`
- Button text: `t("apps.ipod.menu.addSong")`
- Dialog titles: `t("apps.ipod.dialogs.clearLibraryTitle")`
- Status messages: `t("apps.ipod.status.shuffleOn")`
- Toast messages: `t("apps.ipod.dialogs.libraryExportedSuccessfully")`
- Aria labels: `t("apps.ipod.ariaLabels.select")`

**Important considerations:**
- For dynamic strings with variables, use interpolation: `t("key", { variable: value })`
- For conditional strings, use ternary: `isPlaying ? t("pause") : t("play")`
- For strings with checkmarks, use template literals: `` `✓ ${t("key")}` ``
- Check for duplicate declarations (e.g., arrays defined in multiple places)
- Update all instances of the same string across the codebase

### Step 6: Validate Translation Coverage
Check for any remaining hardcoded strings:
```bash
bun run scripts/find-untranslated-strings.ts
```

Review the output and replace any remaining hardcoded strings.

## Component-Specific Guidelines

### Menu Bars
- Replace all menu labels, menu items, and submenu items
- Replace disabled state text
- Replace separator labels if any

### Dialogs
- Replace dialog titles and descriptions
- Replace button labels (OK, Cancel, etc.)
- Replace form labels and placeholders

### Status Messages
- Replace all `showStatus()` calls with translated strings
- Replace toast notifications with translated strings

### Help Items
- Help items are automatically translated via `useTranslatedHelpItems` hook
- Ensure translation keys follow the pattern: `apps.[appName].help.[itemKey].title` and `apps.[appName].help.[itemKey].description`

## Common Issues and Solutions

**Issue: Duplicate variable declarations**
- Solution: Remove duplicate declarations, keep only one definition

**Issue: Missing translation keys**
- Solution: Add missing keys to `en/translation.json` and re-sync

**Issue: Translation keys not updating**
- Solution: Ensure `t` is included in dependency arrays for `useMemo`/`useCallback`

**Issue: Menu bar still shows English**
- Solution: Verify all menu items use `t()` calls, check for missed hardcoded strings

## Verification Checklist

- [ ] All hardcoded strings extracted and added to translation files
- [ ] Translation keys synced across all language files
- [ ] [TODO] keys machine translated
- [ ] All source files updated with `useTranslation` hook
- [ ] All hardcoded strings replaced with `t()` calls
- [ ] Dependency arrays updated where needed
- [ ] No linter errors
- [ ] Validation script shows no remaining hardcoded strings
- [ ] UI displays correctly in different languages

## Notes

- The `useTranslatedHelpItems` hook automatically translates help items, so help item arrays don't need manual `t()` calls
- Some strings like emoji or special characters (e.g., "♪", "✓") may remain hardcoded if they're universal symbols
- Language-specific strings (like "繁體" for Traditional Chinese) should still be translated for consistency

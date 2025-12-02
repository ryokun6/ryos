# ryOS Localization Guide

## Quick Start

### 1. Adding Translation to a Component

```typescript
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <button>{t("common.menu.save")}</button>
  );
}
```

### 2. Translating Menu Bars

**Before:**
```typescript
<Button>File</Button>
<DropdownMenuItem>Save</DropdownMenuItem>
```

**After:**
```typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

<Button>{t("common.menu.file")}</Button>
<DropdownMenuItem>{t("common.dialog.save")}</DropdownMenuItem>
```

### 3. Translating Help Items

**Option A: Use the hook (recommended)**
```typescript
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "../index";

const translatedHelpItems = useTranslatedHelpItems("finder", helpItems);

<HelpDialog helpItems={translatedHelpItems} appName={t("apps.finder.name")} />
```

**Option B: Manual translation**
```typescript
const helpItems = [
  {
    icon: "🔍",
    title: t("apps.finder.help.browseNavigate.title"),
    description: t("apps.finder.help.browseNavigate.description"),
  },
  // ...
];
```

### 4. Translating App Names

**Before:**
```typescript
const appName = appRegistry[appId]?.name || appId;
```

**After:**
```typescript
import { getTranslatedAppName } from "@/utils/i18n";
const appName = getTranslatedAppName(appId);
```

## Common Translation Keys

### Menu Items
- `common.menu.file` - "File"
- `common.menu.edit` - "Edit"
- `common.menu.view` - "View"
- `common.menu.help` - "Help"
- `common.menu.close` - "Close"
- `common.menu.save` - "Save"
- `common.menu.newFile` - "New File"
- `common.menu.open` - "Open..."
- `common.menu.undo` - "Undo"
- `common.menu.redo` - "Redo"
- `common.menu.cut` - "Cut"
- `common.menu.copy` - "Copy"
- `common.menu.paste` - "Paste"
- `common.menu.selectAll` - "Select All"

### Dialog Strings
- `common.dialog.save` - "Save"
- `common.dialog.cancel` - "Cancel"
- `common.dialog.confirm` - "Confirm"
- `common.dialog.close` - "Close"
- `common.dialog.help` - "Help"
- `common.dialog.about` - "About"
- `common.dialog.delete` - "Delete"

### App-Specific
- `apps.[appId].name` - App name
- `apps.[appId].description` - App description
- `apps.[appId].help.[key].title` - Help item title
- `apps.[appId].help.[key].description` - Help item description

## Step-by-Step: Translating a Menu Bar

1. **Open the MenuBar file** (e.g., `TextEditMenuBar.tsx`)

2. **Add import:**
```typescript
import { useTranslation } from "react-i18next";
```

3. **Add hook in component:**
```typescript
export function TextEditMenuBar({ ... }) {
  const { t } = useTranslation();
  // ... rest of component
}
```

4. **Replace hardcoded strings:**
```typescript
// Before
<Button>File</Button>
<DropdownMenuItem>New File</DropdownMenuItem>

// After
<Button>{t("common.menu.file")}</Button>
<DropdownMenuItem>{t("common.menu.newFile")}</DropdownMenuItem>
```

5. **Add missing keys to translation files** if needed

6. **Test** by switching languages in Control Panels

## Step-by-Step: Translating Help Items

1. **Open the app's index file** (e.g., `src/apps/finder/index.ts`)

2. **Update component to use translated help items:**
```typescript
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";

// In component:
const translatedHelpItems = useTranslatedHelpItems("finder", helpItems);

<HelpDialog 
  helpItems={translatedHelpItems} 
  appName={t("apps.finder.name")}
/>
```

3. **Verify translation keys exist** in all language files

## Finding Untranslated Strings

Run the helper script:
```bash
bun run scripts/find-untranslated-strings.ts
```

This will scan the codebase for common English strings that might need translation.

## Adding New Translation Keys

1. **Add to English file first** (`src/lib/locales/en/translation.json`)
2. **Add to all other language files** (zh-TW, ja, ko, fr, de)
3. **Use consistent naming** - follow the existing structure
4. **Test** with language switcher

## Testing Checklist

After translating a component:
- [ ] Switch to English - verify text appears
- [ ] Switch to Chinese Traditional - verify characters render
- [ ] Switch to Japanese - verify characters render
- [ ] Switch to Korean - verify characters render
- [ ] Switch to French - verify accents render
- [ ] Switch to German - verify umlauts render
- [ ] Check for text overflow/truncation
- [ ] Verify UI layout doesn't break

## Common Pitfalls

1. **Forgetting to add keys to all languages** - Always update all 6 language files
2. **Using wrong key path** - Double-check the key structure matches JSON
3. **Not testing all languages** - Some languages have longer text that can break layouts
4. **Hardcoding fallbacks** - Use `defaultValue` in `t()` instead
5. **Missing appId in help items** - Make sure to pass appId when using `useTranslatedHelpItems`

## Priority Order

Work through translations in this order for maximum impact:

1. **High Priority:**
   - App menu bars (user sees these constantly)
   - App names/descriptions (visible everywhere)
   - Help items (first thing users see)

2. **Medium Priority:**
   - Toast notifications
   - Error messages
   - Tooltips

3. **Low Priority:**
   - Debug messages
   - Console logs
   - Developer-facing strings


# ryOS Localization Roadmap

## Current Status

### ✅ Completed
- [x] i18n infrastructure (react-i18next setup)
- [x] Language store with localStorage persistence
- [x] Translation files for 6 languages (en, zh-TW, ja, ko, fr, de)
- [x] Core dialogs translated (HelpDialog, AboutDialog, InputDialog, ConfirmDialog)
- [x] System menu translated (MenuBar.tsx - File, Edit, View, Go, Help)
- [x] Language switcher in Control Panels → Appearance tab
- [x] Helper utilities created (`src/utils/i18n.ts`, `src/hooks/useTranslatedHelpItems.ts`)
- [x] Translation sync script (`scripts/sync-translations.ts`)
- [x] Machine translation script (`scripts/machine-translate.ts`) using Gemini 2.5 Flash
- [x] String extraction script (`scripts/extract-menu-strings.ts`)
- [x] Chinese Traditional (zh-TW) translation file fully translated (246 keys)

### 🔄 In Progress / Remaining

#### 1. App Menu Bars (15 apps)
Each app has a `*MenuBar.tsx` file that needs translation. Common patterns:
- File menu: New File, Open, Save, Close, etc.
- Edit menu: Undo, Redo, Cut, Copy, Paste, Select All
- Format menu (TextEdit): Bold, Italic, Underline, Headings
- View menu: Various view options
- App-specific menus

**Progress: 8/15 completed (53%)**

**Files completed:**
- [x] `src/apps/finder/components/FinderMenuBar.tsx` ✅
- [x] `src/apps/textedit/components/TextEditMenuBar.tsx` ✅
- [x] `src/apps/terminal/components/TerminalMenuBar.tsx` ✅
- [x] `src/apps/videos/components/VideosMenuBar.tsx` ✅
- [x] `src/apps/soundboard/components/SoundboardMenuBar.tsx` ✅
- [x] `src/apps/pc/components/PcMenuBar.tsx` ✅
- [x] `src/apps/photo-booth/components/PhotoBoothMenuBar.tsx` ✅
- [x] `src/apps/minesweeper/components/MinesweeperMenuBar.tsx` ✅

**Files remaining (7):**
- [ ] `src/apps/paint/components/PaintMenuBar.tsx` (18 strings)
- [ ] `src/apps/ipod/components/IpodMenuBar.tsx` (25 strings)
- [ ] `src/apps/chats/components/ChatsMenuBar.tsx` (4 strings)
- [ ] `src/apps/internet-explorer/components/InternetExplorerMenuBar.tsx` (32 strings)
- [ ] `src/apps/synth/components/SynthMenuBar.tsx` (1 string)
- [ ] `src/apps/applet-viewer/components/AppletViewerMenuBar.tsx` (4 strings)
- [ ] `src/apps/control-panels/components/ControlPanelsMenuBar.tsx` (1 string)

#### 2. Help Items Translation
Each app's help items need to use translations. Use the `useTranslatedHelpItems` hook.

**Files to update:**
- [ ] `src/components/dialogs/HelpDialog.tsx` - Update to use `useTranslatedHelpItems`
- [ ] All app components that pass `helpItems` to `HelpDialog`

#### 3. App Names & Descriptions
Update components to use `getTranslatedAppName()` and `getTranslatedAppDescription()`.

**Files to update:**
- [ ] `src/components/layout/MenuBar.tsx` - `getAppName()` function
- [ ] `src/components/layout/Dock.tsx` - App labels
- [ ] `src/components/layout/StartMenu.tsx` - App names in menu
- [ ] `src/apps/base/AppManager.tsx` - Window titles
- [ ] Any component displaying app names/descriptions

#### 4. Additional UI Strings
- [ ] Boot screen messages (`src/utils/bootMessage.ts`)
- [ ] Toast notifications (where applicable)
- [ ] Error messages
- [ ] Tooltips and alt text

## Systematic Approach

### Phase 1: Create Translation Keys (if missing)
1. Identify all hardcoded strings in a component
2. Add missing keys to `src/lib/locales/en/translation.json`
3. Add translations to other language files

### Phase 2: Update Components
1. Import `useTranslation` hook
2. Replace hardcoded strings with `t("key.path")`
3. Test with language switcher

### Phase 3: Batch Translation Updates
Work through apps systematically:
1. Start with simpler apps (Minesweeper, Photo Booth)
2. Move to medium complexity (Videos, Soundboard)
3. Finish with complex apps (TextEdit, Terminal, Chats)

## Helper Utilities

### `useTranslation()` Hook
```typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
const text = t("common.menu.file"); // "File"
```

### `getTranslatedAppName(appId)`
```typescript
import { getTranslatedAppName } from "@/utils/i18n";
const name = getTranslatedAppName("finder"); // Returns translated name
```

### `useTranslatedHelpItems(appId, originalHelpItems)`
```typescript
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
const translatedItems = useTranslatedHelpItems("finder", helpItems);
```

## Translation Key Structure

```
common.menu.*          - Menu items (File, Edit, View, etc.)
common.dialog.*        - Dialog strings (Save, Cancel, etc.)
common.system.*        - System messages
apps.[appId].name      - App name
apps.[appId].description - App description
apps.[appId].help.*    - Help items
settings.language.*    - Language settings
```

## Best Practices

1. **Always use translation keys** - Never hardcode user-facing strings
2. **Provide fallbacks** - Use `defaultValue` in `t()` calls when appropriate
3. **Test all languages** - Switch languages and verify UI doesn't break
4. **Keep keys organized** - Follow the namespace structure
5. **Update all languages** - When adding a new key, add it to all 6 language files

## Quick Reference

### Common Menu Items
- `common.menu.file` - "File"
- `common.menu.edit` - "Edit"
- `common.menu.view` - "View"
- `common.menu.help` - "Help"
- `common.menu.close` - "Close"
- `common.menu.save` - "Save"
- `common.menu.cancel` - "Cancel"

### Common Dialog Strings
- `common.dialog.save` - "Save"
- `common.dialog.cancel` - "Cancel"
- `common.dialog.confirm` - "Confirm"
- `common.dialog.help` - "Help"
- `common.dialog.about` - "About"

## Testing Checklist

After translating each component:
- [ ] Switch to each language (en, zh-TW, ja, ko, fr, de)
- [ ] Verify text displays correctly
- [ ] Check for text overflow/truncation
- [ ] Verify special characters render properly
- [ ] Test on mobile if applicable
- [ ] Check RTL languages if added later

## Translation File Status

### Current Translation Coverage
- ✅ **English (en)**: Complete (507 keys) - Source of truth
- ✅ **Chinese Traditional (zh-TW)**: Complete (0 [TODO] keys) - Fully machine translated
- ⏳ **Japanese (ja)**: 246 [TODO] keys remaining
- ⏳ **Korean (ko)**: 246 [TODO] keys remaining
- ⏳ **French (fr)**: 246 [TODO] keys remaining
- ⏳ **German (de)**: 246 [TODO] keys remaining

### Translation Tools Available
- `bun run i18n:extract` - Extract untranslated strings from menu bars
- `bun run i18n:sync` - Sync English keys to other languages
- `bun run i18n:sync:mark-todo` - Sync and mark untranslated keys with [TODO]
- `bun run i18n:translate` - Machine translate all [TODO] keys using Gemini 2.5 Flash
- `bun run i18n:translate:dry-run` - Preview translations without applying
- `bun run i18n:find-untranslated` - Find hardcoded English strings in codebase

## Next Steps

1. **Translate remaining menu bars** (7 apps, ~85 strings total)
   - Start with simple ones: Synth (1), Control Panels (1)
   - Then medium: Chats (4), Applet Viewer (4)
   - Finally complex: Paint (18), iPod (25), Internet Explorer (32)

2. **Machine translate remaining languages**
   - `bun run i18n:translate --lang ja` (Japanese)
   - `bun run i18n:translate --lang ko` (Korean)
   - `bun run i18n:translate --lang fr` (French)
   - `bun run i18n:translate --lang de` (German)
   - Or translate all: `bun run i18n:translate`

3. **Review and refine translations** - Check machine translations for accuracy

4. **Update help items** - Use `useTranslatedHelpItems` hook in all apps

5. **Update app names/descriptions** - Use `getTranslatedAppName()` and `getTranslatedAppDescription()`


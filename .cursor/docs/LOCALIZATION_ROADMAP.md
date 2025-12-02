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

### 🔄 In Progress / Remaining

#### 1. App Menu Bars (14 apps)
Each app has a `*MenuBar.tsx` file that needs translation. Common patterns:
- File menu: New File, Open, Save, Close, etc.
- Edit menu: Undo, Redo, Cut, Copy, Paste, Select All
- Format menu (TextEdit): Bold, Italic, Underline, Headings
- View menu: Various view options
- App-specific menus

**Files to update:**
- [ ] `src/apps/finder/components/FinderMenuBar.tsx`
- [ ] `src/apps/textedit/components/TextEditMenuBar.tsx`
- [ ] `src/apps/paint/components/PaintMenuBar.tsx`
- [ ] `src/apps/ipod/components/IpodMenuBar.tsx`
- [ ] `src/apps/chats/components/ChatsMenuBar.tsx`
- [ ] `src/apps/terminal/components/TerminalMenuBar.tsx`
- [ ] `src/apps/videos/components/VideosMenuBar.tsx`
- [ ] `src/apps/soundboard/components/SoundboardMenuBar.tsx`
- [ ] `src/apps/internet-explorer/components/InternetExplorerMenuBar.tsx`
- [ ] `src/apps/synth/components/SynthMenuBar.tsx`
- [ ] `src/apps/pc/components/PcMenuBar.tsx`
- [ ] `src/apps/photo-booth/components/PhotoBoothMenuBar.tsx`
- [ ] `src/apps/minesweeper/components/MinesweeperMenuBar.tsx`
- [ ] `src/apps/applet-viewer/components/AppletViewerMenuBar.tsx`
- [ ] `src/apps/control-panels/components/ControlPanelsMenuBar.tsx`

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

## Next Steps

1. **Start with one app** - Pick a simple app (e.g., Minesweeper) and fully translate it
2. **Create a template** - Use that as a template for other apps
3. **Batch similar items** - Translate all menu bars together, then all help items
4. **Test incrementally** - Test each app after translation


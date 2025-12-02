# ryOS Localization - Systematic Work Plan

## 🎯 Goal
Complete localization of ryOS for 6 languages: English, Chinese Traditional, Japanese, Korean, French, and German.

## ✅ What's Done

### Infrastructure
- ✅ i18n setup with react-i18next
- ✅ Language store with localStorage persistence
- ✅ Translation files for all 6 languages
- ✅ Language switcher in Control Panels → Appearance tab

### Translated Components
- ✅ Core dialogs (HelpDialog, AboutDialog, InputDialog, ConfirmDialog)
- ✅ System menu (MenuBar.tsx - File, Edit, View, Go, Help menus)
- ✅ Helper utilities (`getTranslatedAppName`, `useTranslatedHelpItems`)

## 📋 What's Remaining

### 1. App Menu Bars (14 files)
**Estimated time:** 2-3 hours

Each app has a menu bar component that needs translation. Most follow similar patterns:
- File menu: New, Open, Save, Close
- Edit menu: Undo, Redo, Cut, Copy, Paste
- View menu: Various options
- App-specific menus

**Files:**
```
src/apps/finder/components/FinderMenuBar.tsx
src/apps/textedit/components/TextEditMenuBar.tsx
src/apps/paint/components/PaintMenuBar.tsx
src/apps/ipod/components/IpodMenuBar.tsx
src/apps/chats/components/ChatsMenuBar.tsx
src/apps/terminal/components/TerminalMenuBar.tsx
src/apps/videos/components/VideosMenuBar.tsx
src/apps/soundboard/components/SoundboardMenuBar.tsx
src/apps/internet-explorer/components/InternetExplorerMenuBar.tsx
src/apps/synth/components/SynthMenuBar.tsx
src/apps/pc/components/PcMenuBar.tsx
src/apps/photo-booth/components/PhotoBoothMenuBar.tsx
src/apps/minesweeper/components/MinesweeperMenuBar.tsx
src/apps/applet-viewer/components/AppletViewerMenuBar.tsx
src/apps/control-panels/components/ControlPanelsMenuBar.tsx
```

**Process:**
1. Open file
2. Add `import { useTranslation } from "react-i18next"`
3. Add `const { t } = useTranslation()` in component
4. Replace hardcoded strings with `t("key")`
5. Test with language switcher

### 2. Help Items Translation (14 apps)
**Estimated time:** 1-2 hours

Update all apps to use `useTranslatedHelpItems` hook for help items.

**Process:**
1. In each app component, import the hook
2. Replace `helpItems` with `useTranslatedHelpItems(appId, helpItems)`
3. Verify translations appear correctly

### 3. App Names & Descriptions
**Estimated time:** 30 minutes

Update components that display app names to use `getTranslatedAppName()`.

**Files to check:**
- `src/components/layout/MenuBar.tsx` - Already uses `getAppName()`, update to use translation
- `src/components/layout/Dock.tsx` - App labels
- `src/components/layout/StartMenu.tsx` - App names
- `src/apps/base/AppManager.tsx` - Window titles

## 🛠️ Tools & Utilities

### Helper Scripts
- **Find untranslated strings:** `bun run scripts/find-untranslated-strings.ts`
  - Scans codebase for common English strings that might need translation

### Helper Functions
- **`getTranslatedAppName(appId)`** - Get translated app name
- **`getTranslatedAppDescription(appId)`** - Get translated app description
- **`useTranslatedHelpItems(appId, originalHelpItems)`** - Hook for translated help items

### Documentation
- **`LOCALIZATION_ROADMAP.md`** - Detailed roadmap and checklist
- **`LOCALIZATION_GUIDE.md`** - Step-by-step guide with examples

## 📝 Recommended Workflow

### Phase 1: Quick Wins (Start Here)
1. **Translate simple menu bars first** (Minesweeper, Photo Booth)
   - These have fewer menu items
   - Good for establishing the pattern
   - Builds momentum

2. **Update help items for translated apps**
   - Use `useTranslatedHelpItems` hook
   - Quick to implement

### Phase 2: Medium Complexity
3. **Translate medium apps** (Videos, Soundboard, Paint)
   - More menu items but straightforward

4. **Update app names/descriptions**
   - One-time update across all components

### Phase 3: Complex Apps
5. **Translate complex apps** (TextEdit, Terminal, Chats, iPod)
   - These have more complex menus
   - May need additional translation keys

### Phase 4: Polish
6. **Test all languages**
   - Switch through all 6 languages
   - Check for text overflow
   - Verify special characters render

7. **Find and fix any missed strings**
   - Run `find-untranslated-strings.ts`
   - Manually review UI

## 🎨 Translation Key Structure

```
common.menu.*          - Menu items (File, Edit, View, etc.)
common.dialog.*        - Dialog strings (Save, Cancel, etc.)
common.system.*        - System messages
apps.[appId].name      - App name
apps.[appId].description - App description
apps.[appId].help.*    - Help items
settings.language.*    - Language settings
```

## ✅ Testing Checklist

After each component:
- [ ] Switch to English - verify text appears
- [ ] Switch to Chinese Traditional - verify characters render
- [ ] Switch to Japanese - verify characters render  
- [ ] Switch to Korean - verify characters render
- [ ] Switch to French - verify accents render
- [ ] Switch to German - verify umlauts render
- [ ] Check for text overflow/truncation
- [ ] Verify UI layout doesn't break

## 🚀 Getting Started

1. **Pick one simple app** (e.g., Minesweeper)
2. **Translate its menu bar** following `LOCALIZATION_GUIDE.md`
3. **Update its help items** using the hook
4. **Test with language switcher**
5. **Repeat for next app**

## 📊 Progress Tracking

Track your progress in `LOCALIZATION_ROADMAP.md`:
- Check off completed menu bars
- Check off completed help items
- Note any issues or missing keys

## 💡 Tips

1. **Work systematically** - One app at a time
2. **Test frequently** - Switch languages after each app
3. **Use the helper script** - Find untranslated strings periodically
4. **Keep translations consistent** - Use existing keys when possible
5. **Document missing keys** - Add them to translation files as you go

## 🎯 Success Criteria

Localization is complete when:
- ✅ All menu bars are translated
- ✅ All help items are translated
- ✅ App names/descriptions use translations
- ✅ All 6 languages tested and working
- ✅ No hardcoded English strings in UI components


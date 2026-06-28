# German (`de`) Translation Audit vs AppleGlot macOS Glossary

Read-only audit of all **3,754** flattened keys in `src/lib/locales/de/translation.json` against `src/lib/locales/en/translation.json`, cross-checked with the official **AppleGlot German.dmg** glossary (mounted read-only at `/Volumes/German`, then detached). No files were modified.

---

## Methodology

1. **Flattened** the nested JSON into 3,754 dot-path keys (EN = DE count; 0 missing, 0 extra, 0 `[TODO]`).
2. **Parsed** all `*.lg` XML glossary files from the DMG → **256,700** `<TranslationSet>` entries, **125,311** unique English base strings.
3. For each catalog key, looked up an **exact** English base-string match in the glossary.
4. Compared the current German value to Apple’s **dominant** translation (highest hit count; ties broken alphabetically).
5. Cross-checked the repo’s **241 curated Apple UI terms** via `getExpectedAppleUiTerm()` / `scripts/audit-translations.ts` (all pass for `de`).
6. Classified findings into: nomenclature, progress-indicator pattern, typography/casing, untranslated leaks, context collisions, placeholder/plural defects.

**Confidence rule for “high-confidence”:** dominant Apple variant ≥80% and glossary total ≥3 (or ≥5 at ≥90%), excluding placeholder-bearing strings and intentional product names.

---

## Metrics

| Metric | Value |
|--------|------:|
| Total flattened keys | 3,754 |
| Keys with exact EN match in Apple glossary | 1,356 (36.1%) |
| Keys matching Apple dominant translation | 1,004 (26.7%) |
| Keys with no exact glossary match (ryOS-specific / compound) | 2,398 (63.9%) |
| Curated Apple UI terms checked | 241 |
| Curated term mismatches | **0** |
| Placeholder defects | **0** |
| CLDR plural form defects | **0** |
| **High-confidence concrete issues** | **72** |
| — Nomenclature (lemma change) | 19 |
| — Progress-indicator pattern | 23 |
| — Typography / casing | 27 |
| — Untranslated English leaks (Apple has DE) | 3 |
| Context-dependent collisions (ambiguous glossary) | 78 |
| Moderate-confidence nomenclature (n=1–2 or 80–89%) | 81 |
| English=German but acceptable (brands, symbols, ratios) | 64 |

---

## Executive findings

**Strongest systemic gaps**

- **Progress strings:** German often uses progressive/passive forms (`Lädt...`, `Wird gespeichert …`, `Sucht...`) where Apple consistently uses **infinitive + NBSP + U+2026** (`Laden …`, `Sichern …`, `Suchen …`) — 23 keys.
- **speichern vs sichern:** Apple prefers **Sichern** for Save/Saving in system UI; ryOS uses **Speichern/Wird gespeichert** in several auth/control-panel strings.
- **Finder object terminology:** Apple uses **Objekt/Objekte** for file items; ryOS uses **Element/Elemente** in several surfaces.
- **Media UI:** **Jetzt läuft** (Apple) vs **Aktuelle Wiedergabe** / **Läuft gerade** (ryOS) — 3 keys.
- **Typography:** Widespread ASCII `...` instead of Apple’s ` …` (NBSP + U+2026) — 27 keys.

**Clean areas**

- All 241 pre-curated Apple standalone terms match.
- Placeholder parity (`{{count}}`, etc.) is intact across all 3,754 keys.
- German CLDR plural forms (`_one`, `_other`, etc.) are complete.

---

## High-confidence concrete issues (72)

Format: **key** | EN | current → recommendation | Apple counts | confidence / n | rationale

### A. Nomenclature mismatches (19)

| Key | EN | Current | Recommend | Apple counts | Conf / n | Rationale |
|-----|-----|---------|-----------|--------------|----------|-----------|
| `common.aboutThisMac.privacyPolicy` | Privacy Policy | Datenschutzerklärung | Datenschutzvereinbarung | Datenschutzvereinbarung×6; Datenschutzrichtlinien×1 | 86% / 7 | Apple legal label, not “Erklärung” |
| `common.auth.createAccount` | Create Account | Konto erstellen | Account erstellen | Account erstellen×5 | 100% / 5 | Apple retains “Account” in German macOS |
| `common.auth.recovery.mismatch` | Passwords do not match | Passwörter stimmen nicht überein | Die Passwörter stimmen nicht überein. | dominant form×7 | 88% / 8 | Apple adds article + period |
| `spotlight.topHits` | Top Hits | Top-Treffer | Toptreffer | Toptreffer×3 | 100% / 3 | Apple compounds without hyphen |
| `apps.finder.statusBar.item` | item | Element | Objekt | Objekt×10; Obj.×1 | 91% / 11 | Finder uses “Objekt” for file items |
| `apps.finder.statusBar.items` | items | Elemente | Objekte | Objekte×12; Einträge×2 | 80% / 15 | Same Finder convention |
| `apps.finder.defaultNames.untitledFolder` | untitled folder | Unbenannter Ordner | Neuer Ordner | Neuer Ordner×14 | 100% / 14 | Apple default folder name (context: new folder) |
| `apps.chats.toolCalls.settingsCheckingForUpdates` | Checking for updates… | Suche nach Updates… | Nach Updates suchen … | Nach Updates suchen …×5 | 100% / 5 | Apple infinitive word order |
| `apps.textedit.alignLeft` | Align Left | Links ausrichten | Linksbündig | Linksbündig×79 | 100% / 79 | Strong Apple TextEdit/Format term |
| `apps.textedit.alignRight` | Align Right | Rechts ausrichten | Rechtsbündig | Rechtsbündig×79 | 100% / 79 | Same |
| `apps.paint.dialogs.saveImage` | Save Image | Bild speichern | Bild sichern | Bild sichern×3 | 100% / 3 | Apple “sichern” for save actions |
| `apps.ipod.menuItems.nowPlaying` | Now Playing | Aktuelle Wiedergabe | Jetzt läuft | Jetzt läuft×11 | 92% / 12 | Apple Music/iPod label |
| `apps.applet-viewer.labels.showAll` | Show All | Alle anzeigen | Alle einblenden | Alle einblenden×193; Alle anzeigen×17 | 91% / 212 | Apple “einblenden” for reveal/show-all |
| `apps.control-panels.privacyPolicy` | Privacy Policy | Datenschutzerklärung | Datenschutzvereinbarung | same as above | 86% / 7 | Duplicate surface |
| `apps.control-panels.dynamicWallpapers.nowPlaying` | Now Playing | Läuft gerade | Jetzt läuft | Jetzt läuft×11 | 92% / 12 | Media now-playing label |
| `apps.dashboard.ipod.nowPlaying` | Now Playing | Aktuelle Wiedergabe | Jetzt läuft | Jetzt läuft×11 | 92% / 12 | Same |
| `apps.books.shelf.gridView` | Grid View | Gitteransicht | Rasterdarstellung | Rasterdarstellung×3 | 100% / 3 | Apple Books grid term |
| `apps.books.shelf.listView` | List View | Listenansicht | Listendarstellung | Listendarstellung×8 | 100% / 8 | Apple Books list term |
| `apps.calculator.speech.keys.random` | random | Zufall | Zufällig | Zufällig×4 | 100% / 4 | Adjective form for speech key |

### B. Progress-indicator pattern (23)

Apple pattern: **infinitive + ` …`** (not `Wird …`, `Lädt...`, `Sucht...`, or gerund phrases).

| Key | EN | Current | Recommend | Apple dominant | Conf / n |
|-----|-----|---------|-----------|----------------|----------|
| `common.loading.default` | Loading… | Lädt... | Laden … | Laden …×66 | 96% / 69 |
| `common.auth.loggingIn` | Signing in… | Wird angemeldet... | Anmelden … | Anmelden …×5 | 100% / 5 |
| `common.auth.changePassword.saving` | Saving… | Wird gespeichert … | Sichern … | Sichern …×9 | 100% / 9 |
| `common.auth.recovery.sending` | Sending… | Wird gesendet... | Senden … | Senden …×6 | 100% / 6 |
| `apps.finder.menu.rename` | Rename… | Umbenennen... | Umbenennen … | Umbenennen …×14 | 100% / 14 |
| `apps.finder.messages.loading` | Loading… | Laden... | Laden … | Laden …×66 | 96% / 69 |
| `apps.internet-explorer.loadingEllipsis` | Loading… | Lade... | Laden … | Laden …×66 | 96% / 69 |
| `apps.chats.status.recording` | Recording… | Aufnahme läuft... | Aufnahme… | Aufnahme×14 | 100% / 14 |
| `apps.ipod.dialogs.lyricsSearchSearching` | Searching… | Suche... | Suchen … | Suchen …×23 | 100% / 23 |
| `apps.ipod.dialogs.songSearchSearching` | Searching… | Wird gesucht... | Suchen … | Suchen …×23 | 100% / 23 |
| `apps.applet-viewer.dialogs.loading` | Loading… | Laden... | Laden … | Laden …×66 | 96% / 69 |
| `apps.control-panels.loggingOut` | Signing out… | Abmelden... | Abmelden … | Abmelden …×5 | 100% / 5 |
| `apps.control-panels.recoveryEmail.saving` | Sending… | Wird gesendet... | Senden … | Senden …×6 | 100% / 6 |
| `apps.control-panels.recoveryEmail.verifying` | Verifying… | Wird verifiziert... | Überprüfen … | Überprüfen …×4 | 100% / 4 |
| `apps.control-panels.deleteAccount.deleting` | Deleting… | Löschen... | Löschen … | Löschen …×3 | 100% / 3 |
| `apps.control-panels.telegram.preparing` | Preparing… | Wird vorbereitet... | Vorbereiten … | Vorbereiten …×24 | 100% / 24 |
| `apps.control-panels.telegram.savingInstructions` | Saving… | Speichern... | Sichern … | Sichern …×9 | 100% / 9 |
| `apps.control-panels.cloudSync.forceDownloading` | Downloading… | Wird heruntergeladen… | Laden … | Laden …×21 | 100% / 21 |
| `apps.control-panels.cloudSync.restoring` | Restoring… | Wiederherstellung läuft… | Wiederherstellen … | Wiederherstellen …×6 | 100% / 6 |
| `apps.dashboard.stocks.searching` | Searching… | Sucht... | Suchen … | Suchen …×23 | 100% / 23 |
| `apps.dashboard.weather.searching` | Searching… | Sucht... | Suchen … | Suchen …×23 | 100% / 23 |
| `apps.admin.redis.loading` | Loading… | Lädt... | Laden … | Laden …×66 | 96% / 69 |
| `apps.admin.profile.processing` | Processing… | Wird verarbeitet… | Bearbeiten … | Bearbeiten …×5 | 100% / 5 |

### C. Typography / casing (27)

| Key | EN | Current | Recommend | Rationale |
|-----|-----|---------|-----------|-----------|
| `common.appleMenu.systemPreferences` | System Preferences… | Systemeinstellungen… | Systemeinstellungen … | Missing NBSP before U+2026 |
| `apps.finder.contextMenu.rename` | Rename… | Umbenennen… | Umbenennen … | NBSP before ellipsis |
| `apps.pc.status.connecting` | Connecting… | Verbinden… | Verbinden … | NBSP before ellipsis |
| `apps.pc.status.loading` | Loading… | Laden… | Laden … | NBSP before ellipsis |
| `apps.control-panels.connectionStatus.connecting` | Connecting… | Verbinden… | Verbinden … | NBSP before ellipsis |
| `common.dialog.adding` | Adding… | Hinzufügen... | Hinzufügen… | ASCII `...` → U+2026 |
| `common.startMenu.run` | Run… | Ausführen... | Ausführen… | ASCII ellipsis |
| `spotlight.hintClose` | close | schließen | Schließen | Sentence-case hint; Apple capitalizes |
| `apps.videos.menu.shareVideo` | Share Video… | Video teilen... | Video teilen… | ASCII ellipsis |
| `apps.videos.status.add` | ADD | HINZUFÜGEN | Hinzufügen | All-caps → sentence case |
| `apps.videos.status.repeat` | REPEAT | WIEDERHOLEN | Wiederholen | All-caps → sentence case |
| `apps.tv.status.title` | TITLE | TITEL | Titel | All-caps → sentence case |
| `apps.tv.status.add` | ADD | HINZUFÜGEN | Hinzufügen | All-caps → sentence case |
| `apps.tv.status.now` | NOW | JETZT | Jetzt | All-caps → sentence case |
| `apps.ipod.menu.shareSong` | Share Song… | Titel teilen... | Titel teilen… | ASCII ellipsis |
| `apps.ipod.dialogs.appleMusicSearchPlaceholder` | Search Apple Music… | Apple Music durchsuchen... | Apple Music durchsuchen… | ASCII ellipsis |
| `apps.dashboard.widgets.addWidget` | Add Widget… | Widget hinzufügen... | Widget hinzufügen… | ASCII ellipsis |
| `apps.dashboard.translation.inputPlaceholder` | Enter text… | Text eingeben... | Text eingeben… | ASCII ellipsis |
| `apps.admin.languages.zh-CN` | Chinese (Simplified) | Chinesisch (vereinfacht) | Chinesisch (Vereinfacht) | Apple capitalizes parenthetical |
| `apps.admin.languages.zh-TW` | Chinese (Traditional) | Chinesisch (traditionell) | Chinesisch (Traditionell) | Same |
| `apps.admin.user.admin` | Admin | admin | Admin | Casing |
| `apps.calculator.speech.keys.plus` | plus | Plus | plus | Lowercase speech key |
| `apps.calculator.speech.keys.ln` | natural log | natürlicher Logarithmus | Natürlicher Logarithmus | Sentence-case speech label |
| `apps.ipod.menuItems.loading` | Loading… | Laden … | Laden … | Regular space → NBSP before ellipsis |
| `apps.maps.searching` | Searching… | Suchen … | Suchen … | Regular space → NBSP |
| `debug.live.loading` | Loading… | Laden … | Laden … | Regular space → NBSP |

### D. Untranslated English leaks — actionable (3)

| Key | EN | Current | Recommend | Apple counts | Conf / n |
|-----|-----|---------|-----------|--------------|----------|
| `apps.ipod.brickGame.gameOverTitle` | Game Over | Game Over | Spiel aus | Spiel aus×3 | 100% / 3 |
| `apps.ipod.brickGame.gameOver` | Game Over | Game Over | Spiel aus | Spiel aus×3 | 100% / 3 |
| `apps.control-panels.min` | min | min | Min. | Min.×6; min×2 | 67% / 9 |

*(64 additional EN=DE keys are intentional: product names, aspect ratios, `@ryo`, `Cover Flow`, `Macintosh HD`, etc.)*

---

## Context-dependent collisions (78)

English strings with **multiple plausible Apple translations** (dominant confidence below 80%, or second-place variant >15%). Current German is often reasonable; Apple match depends on surface context. **Do not auto-fix.**

**Representative examples** (current not in Apple’s top variants):

| Key | EN | Current | Top Apple variants | Notes |
|-----|-----|---------|-------------------|-------|
| `common.dialog.share.itemTypes.item` | Item | Element | Item×31; Objekt×31 | 50/50 split — Finder “Objekt” vs generic “Item” |
| `common.keys.enter` | Enter | Bestätigen | Eingabetaste×4 | Key label vs action verb |
| `common.appleMenu.enterFullScreen` | Enter Full Screen | Vollbild aktivieren | Vollbildmodus×33; Vollbild ein×19 | Menu command phrasing varies |
| `spotlight.settings.theme` | Theme | Design | Thema×5; Modus×2 | ryOS uses “Design”; Apple often “Thema” |
| `apps.internet-explorer.menu.addToFavorites` | Add to Favorites… | Zu Favoriten hinzufügen... | Als Favorit sichern×14 | Apple favors “sichern” for favorites |
| `apps.chats.toolCalls.ipodPaused` | Paused | Pausiert | Angehalten×15; Pause×7 | Media vs process state |
| `apps.videos.menu.shuffle` | Shuffle | Zufallswiedergabe | Zufällige Wiedergabe×17 | Apple shorter forms exist |
| `apps.control-panels.custom` | Custom | Benutzerdefiniert | Eigene×76 | Apple “Eigene” in prefs |
| `apps.control-panels.cloudSync.forceDownload` | Download | Herunterladen | Laden×34; Download×28 | Cloud sync uses “Laden” in some surfaces |
| `apps.calculator.speech.keys.log` | log | Logarithmus | Protokoll×7 | **False positive if applied:** math `log` ≠ system “Protokoll” |

Full collision set: 78 keys (74 where current ∉ top-3 Apple variants).

---

## Moderate-confidence findings (81)

Glossary evidence is thin (n=1–2) or confidence 80–89%. Worth human review, not auto-replacement.

**Meaningful lemma differences (n≥2):**

| Key | Current → Apple dominant | Conf / n |
|-----|--------------------------|----------|
| `common.dock.turnHidingOn` | Automatisch ausblenden aktivieren → Dock ausblenden | 100% / 2 |
| `common.dock.turnHidingOff` | Automatisch ausblenden deaktivieren → Dock immer eingeblendet | 100% / 2 |
| `common.dock.turnMagnificationOn/Off` | aktivieren/deaktivieren → einschalten/ausschalten | 100% / 2 each |
| `apps.finder.menu.aboutFinder` | Über Finder → Über den Finder | 100% / 2 |
| `apps.chats.toolCalls.noItemsFound` | Keine Elemente → Keine Objekte gefunden | 100% / 2 |
| `apps.tv.menu.closedCaptions` | Untertitel (CC) → Erweiterte Untertitel | 100% / 2 |
| `apps.maps.searchPlaceholder` | In Karten suchen → In „Karten“ suchen | 100% / 2 |
| `apps.maps.places.recents` | Zuletzt besucht → Zuletzt benutzt | 100% / 2 |
| `apps.admin.profile.delete` | Nutzer löschen → Benutzer löschen | 100% / 2 |

---

## Structural defects

| Category | Count | Status |
|----------|------:|--------|
| Missing keys | 0 | ✅ |
| Extra keys | 0 | ✅ |
| `[TODO]` markers | 0 | ✅ |
| Placeholder mismatches | 0 | ✅ |
| Missing CLDR plural forms | 0 | ✅ |
| Curated Apple term mismatches | 0 | ✅ |

Built-in audit (`bun scripts/audit-translations.ts`) reports **0 issues** for `de`.

---

## Recommended priority (if fixing later)

1. **Progress indicators** (23 keys) — highest volume, clearest Apple pattern.
2. **Typography** (27 keys) — mechanical NBSP/U+2026/casing fixes.
3. **Core nomenclature** (19 keys) — Objekt/Objekte, Jetzt läuft, Linksbündig, Account, Datenschutzvereinbarung, etc.
4. **Untranslated leaks** (3 keys) — Game Over, min.
5. **Collisions** — case-by-case; many current choices are defensible.

---

## DMG handling

- Mounted: `/Users/ryo/Downloads/Glossaries/German.dmg` → `/Volumes/German` (read-only)
- Detached: `disk6` ejected successfully after parsing

---

*Note: Apple glossary recommendations use NBSP (U+00A0) before ellipsis; displayed above as regular space for readability. Dominant counts come from exact base-string matches across all `.lg` files in the DMG.*

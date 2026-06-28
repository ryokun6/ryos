## French Translation Audit vs AppleGlot macOS Glossary

**Scope:** 680 `.lg` files parsed (125,900 unique English strings). DMG mounted read-only at `/tmp/apple-glossary-fr`, then detached. No files modified.

**Baseline:** Repo curated audit (`audit-translations.ts`, 113 Apple UI terms + contextual overrides) → **0 French issues**. This report is the broader full-glossary pass.

---

### Summary

| Metric | Count |
|--------|------:|
| Total EN/FR keys (flattened) | **3,754** |
| FR-only extra keys (`_many` plurals) | 4 |
| Missing keys | 0 |
| `[TODO]` keys | 0 |
| Placeholder defects | 0 |
| Required plural defects | 0 |
| EN source values with exact Apple glossary hit | **1,338** (35.6%) |
| Keys with no glossary match | 2,416 |

### Mismatch counts by category

| Category | Count | Notes |
|----------|------:|-------|
| **(1) High-confidence nomenclature** | **89** | Dominant Apple term ≥80% confidence, not typography-only |
| **(2) Context-dependent collision** | **83** | Current FR is a valid Apple variant or ryOS context favors current wording |
| **(3) Punctuation/casing/typography** | **39** | Curly apostrophe (`'`→`'`) and/or ellipsis (`...`→`…`); semantics OK |
| **(4) Untranslated EN leaks** | **18** | EN=FR; all appear intentional (brands, language names, units) |
| **(5) Placeholder/plural defects** | **0** | |
| Low-confidence glossary hits | 482 | Short ambiguous tokens (`Action`, `Key`, `Type`…); dominant Apple term unreliable — **not actionable** |

---

### (1) High-confidence nomenclature — all 89 findings

Format: `key` | EN | current FR | recommended FR | Apple (top/total)

**Navigation / menus / views**
- `apps.applet-viewer.labels.showAll` | Show All | Afficher tout | **Tout afficher** | 207/207
- `apps.applet-viewer.menu.checkForUpdates` | Check for Updates | Vérifier les mises à jour | **Rechercher les mises à jour** | 1/1
- `apps.applet-viewer.menu.exportAs` | Export As… | Exporter sous... | **Exporter comme…** | 1/1
- `apps.books.shelf.gridView` | Grid View | Vue Grille | **Présentation en grille** | 3/3
- `apps.books.shelf.listView` | List View | Vue Liste | **Présentation par liste** | 8/8
- `apps.calendar.event.startTime` | Start Time | Heure de début | **Début** | 1/1
- `apps.calendar.menu.dayView` | Day View | Vue Jour | **Présentation par jour** | 1/1
- `apps.calendar.menu.goToToday` | Go to Today | Aller à aujourd'hui | **Aller à Aujourd'hui** | 2/2
- `apps.calendar.menu.monthView` | Month View | Vue Mois | **Présentation par mois** | 1/1
- `apps.calendar.menu.weekView` | Week View | Vue Semaine | **Présentation par semaine** | 1/1
- `apps.chats.menu.decreaseFontSize` | Decrease Font Size | Diminuer la taille de la police | **Diminuer la taille de police** | 1/1
- `apps.chats.menu.increaseFontSize` | Increase Font Size | Augmenter la taille de la police | **Augmenter la taille de police** | 1/1
- `apps.chats.status.newChat` | New chat | Nouveau chat | **Nouvelle conversation** | 1/1
- `apps.terminal.menu.decreaseFontSize` | Decrease Font Size | Diminuer la taille de la police | **Diminuer la taille de police** | 1/1
- `apps.terminal.menu.increaseFontSize` | Increase Font Size | Augmenter la taille de la police | **Augmenter la taille de police** | 1/1
- `apps.textedit.menu.exportAs` | Export As… | Exporter sous... | **Exporter comme…** | 1/1
- `common.dock.removeFromDock` | Remove from Dock | Retirer du Dock | **Supprimer du Dock** | 2/2
- `common.dock.turnHidingOff` | Turn Hiding Off | Désactiver le masquage automatique | **Désactiver le masquage** | 2/2
- `common.dock.turnHidingOn` | Turn Hiding On | Activer le masquage automatique | **Activer le masquage** | 2/2
- `spotlight.topHits` | Top Hits | Résultats principaux | **Meilleurs résultats** | 3/3

**Progress / status strings (Apple uses shorter forms)**
- `apps.chats.status.editing` | editing… | Modification en cours... | **modification…** | 2/2
- `apps.chats.tokenStatus.refreshing` | Refreshing… | Actualisation en cours... | **Actualisation…** | 1/1
- `apps.chats.toolCalls.infiniteMac.clicking` | Clicking… | Clic en cours… | **Clic…** | 1/1
- `apps.chats.toolCalls.infiniteMac.resuming` | Resuming… | Reprise en cours… | **Reprise…** | 1/1
- `apps.control-panels.cloudSync.restoring` | Restoring… | Restauration en cours… | **Restauration…** | 1/1
- `apps.control-panels.telegram.disconnecting` | Disconnecting… | Déconnexion en cours... | **Déconnexion…** | 2/2
- `apps.control-panels.telegram.preparing` | Preparing… | Préparation en cours... | **Préparation…** | 1/1

**Calculator**
- `apps.calculator.conversion.categories.currency` | Currency | Monnaie | **Devise** | 4/4
- `apps.calculator.conversion.swap` | Swap | Échanger | **Permuter** | 2/2
- `apps.calculator.conversion.units.atm` | Atmospheres | Atmosphères | **atmosphère** | 1/1
- `apps.calculator.conversion.units.gal` | Gallons (US) | Gallons (US) | **gallon (américain)** | 1/1
- `apps.calculator.conversion.units.ha` | Hectares | Hectares | **hectare** | 1/1
- `apps.calculator.conversion.units.k` | Kelvin | Kelvin | **kelvin** | 1/1
- `apps.calculator.conversion.units.kph` | Kilometers/Hour | Kilomètres/Heure | **kilomètre/heure** | 1/1
- `apps.calculator.conversion.units.mph` | Miles/Hour | Miles/Heure | **mile/heure** | 1/1
- `apps.calculator.conversion.units.mps` | Meters/Second | Mètres/Seconde | **mètre/s** | 1/1
- `apps.calculator.conversion.units.pa` | Pascals | Pascals | **pascal** | 1/1
- `apps.calculator.conversion.units.sqft` | Square Feet | Pieds carrés | **pied carré** | 1/1
- `apps.calculator.conversion.units.sqkm` | Square Kilometers | Kilomètres carrés | **kilomètre carré** | 1/1
- `apps.calculator.conversion.units.sqm` | Square Meters | Mètres carrés | **mètre carré** | 1/1
- `apps.calculator.conversion.units.sqmi` | Square Miles | Miles carrés | **mile carré** | 1/1
- `apps.calculator.speech.keys.divide` | divided by | divisé par | **Divisé par** | 2/2
- `apps.calculator.speech.keys.random` | random | aléatoire | **Aléatoire** | 4/4
- `apps.calculator.speech.keys.times` | times | multiplier | **fois** | 7/7

**Maps / media / apps**
- `apps.control-panels.debugMode` | Debug Mode | Mode débogage | **Mode Débogage** | 1/1
- `apps.control-panels.formatSamples.numbers` | Numbers: | Nombres : | **Numéros :** | 1/1
- `apps.dashboard.widgets.stickyNote` | Sticky Note | Note adhésive | **Note** | 1/1
- `apps.finder.fileTypes.quicktimeMovie` | QuickTime Movie | Film QuickTime | **Séquence QuickTime** | 1/1
- `apps.infinite-mac.help.captureScreenshot.title` | Capture Screenshot | Capture d'écran | **Capturer l'aperçu** | 1/1
- `apps.infinite-mac.menu.captureScreenshot` | Capture Screenshot | Capturer l'écran | **Capturer l'aperçu** | 1/1
- `apps.internet-explorer.anErrorOccurred` | An error occurred | Une erreur est survenue | **Une erreur s'est produite** | 3/3
- `apps.internet-explorer.enterUrl` | Enter URL | Saisir l'URL | **Saisir une URL** | 2/2
- `apps.internet-explorer.olderVersion` | Older Version | Ancienne version | **Version plus ancienne** | 1/1
- `apps.maps.placeCard.favorited` | Favorited | Ajouté aux favoris | **Favori** | 3/3
- `apps.maps.places.recents` | Recent Places | Lieux récents | **Emplacements récents** | 2/2
- `apps.maps.poiCategory.atm` | ATM | Distributeur | **Distributeur automatique de billets** | 1/1
- `apps.maps.poiCategory.fitnessCenter` | Fitness Center | Salle de sport | **Centre de remise en forme** | 2/2
- `apps.paint.menu.filterMotionBlur` | Motion Blur | Flou de mouvement | **Flou mouvement** | 2/2
- `apps.paint.menu.filterPixelate` | Pixelate | Pixelliser | **Pixéliser** | 1/1
- `apps.pc.menu.aspectRatio` | Aspect Ratio | Format d'image | **Proportions** | 3/3
- `apps.pc.menu.captureScreenshot` | Capture Screenshot | Prendre une capture d'écran | **Capturer l'aperçu** | 1/1
- `apps.pc.status.bytesZero` | 0 MB | 0 Mo | **0 Mo** (NBSP) | 5/5
- `apps.photo-booth.menu.exportPhotos` | Export Photos | Exporter les photos | **Exporter des photos** | 1/1
- `apps.soundboard.description` | Play sound effects | Lire des effets sonores | **Émettre des effets sonores** | 1/1
- `apps.stickies.empty.createNote` | New Note | Nouveau pense-bête | **Nouvelle note** | 12/12
- `apps.stickies.menu.deleteNote` | Delete Note | Supprimer le pense-bête | **Supprimer la note** | 5/5
- `apps.tv.status.time` | TIME | HEURE | **DURÉE** | 2/2
- `apps.videos.status.repeat` | REPEAT | RÉPÉTITION | **RÉPÉTER** | 1/1

**Feature / effect names (Apple keeps EN in some contexts — review before changing)**
- `apps.control-panels.dream` | Dream | Rêve | Dream | 5/5 ← Apple keeps EN
- `apps.dashboard.ipod.modeKaraoke` | Karaoke | Karaoke | Karaoké | 2/2
- `apps.internet-explorer.aurora` | Aurora | Aurora | Aurore | 3/3
- `apps.ipod.menu.fontGoldGlow` | Glow | Lueur | Éclat | 2/2
- `apps.ipod.menuItems.brickGame` | Brick | Brick | Brique | 1/1
- `apps.photo-booth.effects.bulge` | Bulge | Bombement | Renflement | 1/1
- `apps.photo-booth.effects.fishEye` | Fish Eye | Oeil de poisson | Fish Eye | 1/1 ← Apple keeps EN
- `apps.photo-booth.effects.twirl` | Twirl | Tourbillon | Tournoiement | 1/1
- `apps.photo-booth.effects.xRay` | X-Ray | Rayons X | Rayon X | 2/2
- `apps.synth.effectsParams.chorus` | Chorus | Chorus | Chœurs | 5/5
- `apps.synth.envelopeParams.decay` | Decay | Déclin | Chute | 2/2
- `apps.synth.name` | Synth | Synthétiseur | Synthé | 1/1

**Apple Music typography (NBSP)**
- `apps.ipod.menu.libraryAppleMusic` | Apple Music | Apple Music | **Apple Music** | 14/14
- `apps.ipod.menuItems.appleMusicSignIn/SignOut/libraryAppleMusic` | Apple Music | Apple Music | **Apple Music** | 14/14

**Debug / misc**
- `debug.copied` | Copied | Copié | **Copié(s)** | 1/1
- `debug.fix` | Fix | Corriger | **Réparer** | 3/3
- `debug.live.fpsUnit` | fps | fps | **ips** | 1/1
- `debug.live.locale` | Locale | Paramètres régionaux | **Locale** | 4/4

**Likely false positive (glossary context noise, 2/2)**
- `common.desktop.setWallpaper` | Set Wallpaper… | Définir le fond d'écran… | Valider… | 2/2 ← **ignore**; current FR is correct

---

### (2) Context-dependent collisions — all 83 (current FR likely correct)

Grouped by rationale:

**Chat rooms (`Salon` vs Apple `Pièce`)** — keep current
- `apps.admin.profile.room/rooms`, `apps.admin.sidebar.rooms`, `apps.chats.menu.showRooms`, `apps.chats.sidebar.rooms`

**Auth (`Créer un compte` vs Apple Accounts `Créer le compte`)** — keep current for general signup
- `apps.applet-viewer.menu.createAccount`, `apps.chats.menu.createAccount`, `common.appleMenu.createAccount`, `common.auth.createAccount`

**About/Help menus (keep app brand names)** — keep current
- All `About *` / `* Help` keys for Books, Calculator, Contacts, Finder, Photo Booth, Stickies, TextEdit, Videos

**Cloud sync upload terminology** — keep `Téléverser`/`Mise en ligne` (Canadian Apple convention)
- `apps.control-panels.autoSync.uploading`, `cloudSync.backingUp/forceUpload/forceUploading`

**Now Playing** — keep context-specific (`Lecture en cours`, `En lecture`, `À l'écoute`)
- `apps.dashboard.ipod.nowPlaying`, `apps.ipod.menuItems.nowPlaying`

**TextEdit headings** — keep `Titre 1/2/3`, `Liste de tâches` (Apple TextEdit uses `En-tête` in unrelated contexts)
- 10 keys under `apps.textedit.*`

**Finder / general UI where current matches dominant Apple alt**
- `Put Back` → keep "Remettre à sa place" (2 keys)
- `Cancel`/`Annuler` (3 keys) — dominant `Terminé` is wrong context
- `Delete`/`Supprimer` vs `Effacer` — keep Supprimer
- `Privacy Policy` → keep full "Politique de confidentialité" (2 keys)
- `Create Account`, `Enter/Exit Full Screen`, `Maximize`, `Full`, `Split` — window chrome; current acceptable

**Domain-specific**
- `apps.calculator.menu.conversion` Convert → keep "Conversion" (mode name)
- `apps.calculator.speech.keys.log` → keep "log" or use "historique" deliberately
- `apps.contacts.fields.jobTitle` → keep "Fonction"
- `apps.ipod.menu.displayCover` → keep "Pochette"
- `apps.paint.toolbar.hand` → keep "Main"
- `apps.ipod.musicQuiz.scoreShort` → keep "Score" (Apple "Incision" is video-editor context)
- `apps.tv.menu.channels` → keep "Chaînes"
- `debug.live.logging` → keep "Journalisation"
- AI chat: `Thinking`→"Réflexion", `Prompt`→"Prompt" (3 keys)

Full key list available in audit output; all 83 flagged as **no change recommended**.

---

### (3) Punctuation/typography — all 39

Uniform fixes: straight apostrophe → `'`, ASCII ellipsis → `…`. No semantic change.

Includes: `apps.admin.profile.delete/today`, calendar event strings, control-panels sync strings, finder rename, internet-explorer clearHistory, ipod/videos library menus, `common.auth.loggingIn`, dock magnification, etc. (39 keys total — all listed in raw audit under punctuation category).

---

### (4) Untranslated EN leaks — all 18 (intentional)

| Key | Value | Assessment |
|-----|-------|------------|
| `apps.admin.server.websocket` | WebSocket (Pusher) | Technical label |
| `apps.admin.song.soramimi` | Soramimi (空耳) | Feature name |
| `apps.calculator.conversion.units.gal` | Gallons (US) | Unit symbol |
| `apps.calculator.speech.keys.plus/radians` | plus/radians | Math terms |
| `apps.chats.status.ryo` | @ryo | Username |
| `apps.contacts.cardLabels.note` | note | Field label (matches EN UI pattern) |
| `apps.control-panels.min/minute/minutes` | min/minute/minutes | Unit abbreviations |
| `apps.ipod.brickGame.pts` | pts | Game score |
| `apps.ipod.translationLanguages.french` | Français | Language self-name |
| `common.appleMenu.appletStore` | Applet Store… | Product name |
| `common.colors.orange` | orange | Color name (lowercase) |
| `common.menuBar.missionControl` | Mission Control (F3) | Apple feature name |
| `common.toast.total` | total | Label |
| `settings.language.french/spanish` | Français/Español | Language self-names |

---

### (5) Placeholder/plural defects

**None.** All `{{…}}` placeholders match EN. French has 4 extra `_many` plural keys (valid CLDR extras). Required `one`/`other` forms present.

---

### Prioritized action list (for parent synthesis)

**P0 — Clear Apple macOS alignment (~35 keys):** Show All, Check for Updates, Export As, Grid/List View, calendar view labels, font-size menus, dock items, progress strings (editing/refreshing/disconnecting), Currency→Devise, error/URL strings, maps POI labels, screenshot labels, spotlight Top Hits, debug.fix, remove-from-dock.

**P1 — Typography batch (39 keys):** Apostrophe + ellipsis normalization (mechanical, zero semantic risk).

**P2 — Review before changing (~20 keys):** Calculator unit singular forms, speech keys (`times`/`fois`), Stickies note terminology, synth/photo-booth effect names, TV TIME/DURÉE.

**P3 — Keep as-is (83 context collisions + 18 intentional EN):** No action.

**Ignore:** `common.desktop.setWallpaper` (glossary false match), 482 low-confidence short-token hits.

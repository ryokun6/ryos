# Italian (`it`) Full-Catalog AppleGlot Audit

Read-only audit of `src/lib/locales/it/translation.json` against `src/lib/locales/en/translation.json` and the official **Italian.dmg** AppleGlot glossary (`SHA256: 4e21935d…`, matches `scripts/apple-ui-terminology-data.ts`).

**Method:** Parsed 678 `.lg` files (257,437 `TranslationSet` entries → 125,673 unique English bases). For each ryOS key, if the English value exactly matches an Apple `base` (with optional trailing `…` / `...` stripped and re-applied), compared the Italian value to Apple’s dominant translation (highest count; confidence = dominant/total).

**High-confidence threshold:** dominant share ≥ 80% and ≤ 3 distinct Italian alternatives (same as repo glossary extraction heuristics).

---

## Total metrics

| Metric | Count |
|--------|-------|
| English keys | 3,754 |
| Italian keys | 3,758 |
| AppleGlot unique English bases | 125,673 |
| AppleGlot `.lg` files / translation sets | 678 / 257,437 |
| Repo curated Apple UI terms (`apple-ui-terminology-terms.json`) | 113 |
| ryOS keys matching a curated term (exact English) | 241 |
| ryOS keys with **exact Apple base match** | 1,345 |
| Exact-match keys **already aligned** with dominant Apple term | 765 |
| **High-confidence divergences** | **179** |
| Context collisions (exact base, fragmented glossary) | 401 |
| Missing keys | 0 |
| Extra keys | 0 |
| `[TODO]` keys | 0 |
| Placeholder mismatches | 0 |
| Missing Italian plural forms (`one`/`other`) | 0 |
| English-identical values (raw heuristic) | 213 |
| English-identical (after product/technical filter) | ~133 |

**Curated-term audit** (`bun run scripts/audit-translations.ts` / `getExpectedAppleUiTerm`): **0 mismatches** on all 113 curated terms — core macOS nomenclature (Settings, Cancel, Trash, etc.) is aligned.

---

## High-confidence findings breakdown (179)

| Sub-type | Count | Notes |
|----------|-------|-------|
| **Nomenclature** (semantic / wording) | 140 | Real term or phrase differences |
| **Casing** | 23 | Same words, different capitalization |
| **Ellipsis / punctuation** | 11 | Same text, `...` vs `…` only |
| **Glossary false positives** | 5 | Exact base collision; Apple match is wrong domain — **do not apply** |

---

## Glossary false positives (exclude from fixes)

These hit 100% confidence on a single spurious AppleGlot entry; current Italian is correct for ryOS context.

| Key | English | Current | Apple “recommended” | Apple count | Confidence | Context |
|-----|---------|---------|---------------------|-------------|------------|---------|
| `apps.ipod.status.offset` | Offset | Offset | Quando | 1/1 | 1.0 | Music-timing “Offset” ≠ unrelated “Quando” base |
| `apps.ipod.syncMode.offset` | Offset | Offset | Quando | 1/1 | 1.0 | Same |
| `apps.ipod.brickGame.title` | Brick | Brick | Mattone | 1/1 | 1.0 | Game title, not literal “brick” |
| `apps.ipod.menuItems.brickGame` | Brick | Brick | Mattone | 1/1 | 1.0 | Same |
| `apps.ipod.musicQuiz.scoreShort` | Score | Punteggio | Piega | 1/1 | 1.0 | “Score” as points, not “fold” |

---

## Casing (23) — high confidence

| Key | Current | Recommended | Apple count | Confidence |
|-----|---------|-------------|-------------|------------|
| `apps.admin.accessDenied.title` | Accesso Negato | Accesso negato | 1/1 | 1.0 |
| `apps.admin.dashboard.kpi.sessions` | Sessioni | SESSIONI | 2/2 | 1.0 |
| `apps.admin.languages.zh-CN` | Cinese (Semplificato) | Cinese (semplificato) | 4/4 | 1.0 |
| `apps.admin.languages.zh-TW` | Cinese (Tradizionale) | Cinese (tradizionale) | 4/4 | 1.0 |
| `apps.admin.user.admin` | amministratore | Amministratore | 5/5 | 1.0 |
| `apps.calculator.conversion.units.sqft` | Piedi Quadrati | Piedi quadrati | 1/1 | 1.0 |
| `apps.calculator.conversion.units.sqkm` | Chilometri Quadrati | Chilometri quadrati | 1/1 | 1.0 |
| `apps.calculator.conversion.units.sqm` | Metri Quadrati | Metri quadrati | 1/1 | 1.0 |
| `apps.calculator.conversion.units.sqmi` | Miglia Quadrate | Miglia quadrate | 1/1 | 1.0 |
| `apps.calendar.menu.newEvent` | Nuovo Evento | Nuovo evento | 13/13 | 1.0 |
| `apps.chats.menu.showRooms` | Mostra Stanze | Mostra stanze | 1/1 | 1.0 |
| `apps.contacts.cardLabels.url` | URL | url | 7/7 | 1.0 |
| `apps.contacts.menu.deleteContact` | Elimina Contatto | Elimina contatto | 3/3 | 1.0 |
| `apps.contacts.menu.newContact` | Nuovo Contatto | Nuovo contatto | 4/4 | 1.0 |
| `apps.contacts.picturePicker.chooseCustom` | Scegli Immagine… | Scegli immagine… | 1/1 | 1.0 |
| `apps.dashboard.menu.addWidget` | Aggiungi Widget | Aggiungi widget | 1/1 | 1.0 |
| `apps.infinite-mac.menu.captureScreenshot` | Cattura Schermata | Scatta istantanea | 1/1 | 1.0* |
| `apps.internet-explorer.chineseTraditional` | Cinese (Tradizionale) | Cinese (tradizionale) | 4/4 | 1.0 |
| `apps.ipod.brickGame.gameOver` | Game Over | Game over | 3/3 | 1.0 |
| `apps.ipod.brickGame.gameOverTitle` | Game Over | Game over | 3/3 | 1.0 |
| `apps.videos.menu.videosHelp` | Aiuto video | Aiuto Video | 1/1 | 1.0 |
| `common.appleMenu.createAccount` | Crea Account… | Crea account… | 5/5 | 1.0 |
| `common.dock.turnMagnificationOff` | Disattiva ingrandimento | Disattiva Ingrandimento | 2/2 | 1.0 |
| `common.dock.turnMagnificationOn` | Attiva ingrandimento | Attiva Ingrandimento | 2/2 | 1.0 |

\* `captureScreenshot` menu item is nomenclature + casing combined in Apple data.

---

## Ellipsis / punctuation only (11)

| Key | Current | Recommended | Apple count | Confidence |
|-----|---------|-------------|-------------|------------|
| `apps.applet-viewer.menu.exportAs` | Esporta come... | Esporta come… | 1/1 | 1.0 |
| `apps.dashboard.translation.inputPlaceholder` | Inserisci testo... | Inserisci testo… | 1/1 | 1.0 |
| `apps.dashboard.widgets.addWidget` | Aggiungi widget... | Aggiungi widget… | 1/1 | 1.0 |
| `apps.finder.menu.rename` | Rinomina... | Rinomina… | 39/39 | 1.0 |
| `apps.internet-explorer.menu.clearHistory` | Cancella cronologia... | Cancella cronologia… | 4/4 | 1.0 |
| `apps.ipod.dialogs.appleMusicSearchPlaceholder` | Cerca su Apple Music... | Cerca su Apple Music… | 2/2 | 1.0 |
| `apps.ipod.menu.addToLibrary` | Aggiungi alla libreria... | Aggiungi alla libreria… | 14/14 | 1.0 |
| `apps.ipod.menu.shareSong` | Condividi brano... | Condividi brano… | 3/3 | 1.0 |
| `apps.textedit.menu.exportAs` | Esporta come... | Esporta come… | 1/1 | 1.0 |
| `apps.videos.menu.addToLibrary` | Aggiungi alla libreria... | Aggiungi alla libreria… | 14/14 | 1.0 |
| `apps.videos.menu.shareVideo` | Condividi video... | Condividi video… | 4/4 | 1.0 |

**Additional note:** Many nomenclature rows also mix `...` vs `…` with wording changes (e.g. `Caricamento...` → `Carico…`).

---

## Nomenclature mismatches (140) — all high-confidence findings

Dominant Apple Italian term; `count` = dominant occurrences / total for that English base.

### Progress / status verbs (Apple first-person present: “Carico…”, “Salvo…”, “Invio…”)

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `common.loading.default` | Loading… | Caricamento... | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.admin.redis.loading` | Loading… | Caricamento... | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.applet-viewer.dialogs.loading` | Loading… | Caricamento... | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.finder.messages.loading` | Loading… | Caricamento... | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.internet-explorer.loadingEllipsis` | Loading… | Caricamento... | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.ipod.menuItems.loading` | Loading… | Caricamento… | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.pc.status.loading` | Loading… | Caricamento… | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `debug.live.loading` | Loading… | Caricamento… | Carico… | 14/14 | 1.0 | 14/14 «Carico» |
| `apps.control-panels.autoSync.uploading` | Uploading | Caricamento... | Carico | 5/5 | 1.0 | 5/5 «Carico» |
| `apps.control-panels.cloudSync.forceUploading` | Uploading… | Caricamento… | Carico… | 5/5 | 1.0 | 5/5 «Carico» |
| `common.auth.changePassword.saving` | Saving… | Salvataggio in corso... | Salvo… | 2/2 | 1.0 | 2/2 «Salvo» |
| `apps.control-panels.telegram.savingInstructions` | Saving… | Salvataggio in corso... | Salvo… | 2/2 | 1.0 | 2/2 «Salvo» |
| `common.auth.recovery.sending` | Sending… | Invio in corso... | Invio… | 3/3 | 1.0 | 3/3 «Invio» |
| `apps.control-panels.recoveryEmail.saving` | Sending… | Invio in corso... | Invio… | 3/3 | 1.0 | 3/3 «Invio» |
| `common.auth.loggingIn` | Signing in… | Accesso in corso... | Eseguo l'accesso… | 4/4 | 1.0 | 4/4 «Eseguo l'accesso» |
| `apps.control-panels.loggingOut` | Signing out… | Disconnessione in corso... | Esco… | 2/2 | 1.0 | 2/2 «Esco» |
| `apps.control-panels.deleteAccount.deleting` | Deleting… | Eliminazione in corso... | Elimino… | 3/3 | 1.0 | 3/3 «Elimino» |
| `apps.control-panels.telegram.disconnecting` | Disconnecting… | Disconnessione in corso... | Disconnetto… | 2/2 | 1.0 | 2/2 «Disconnetto» |
| `apps.control-panels.telegram.preparing` | Preparing… | Preparazione in corso... | Preparo… | 1/1 | 1.0 | 1/1 «Preparo» |
| `apps.control-panels.autoSync.fetching` | Fetching | Recupero... | Ottengo | 2/2 | 1.0 | 2/2 «Ottengo» |
| `apps.control-panels.cloudSync.restoring` | Restoring… | Ripristino in corso… | Ripristino… | 1/1 | 1.0 | 1/1 «Ripristino» |
| `apps.control-panels.cloudSync.progress.compressing` | Compressing… | Compressione… | Comprimo… | 1/1 | 1.0 | 1/1 «Comprimo» |
| `apps.control-panels.cloudSync.progress.decompressing` | Decompressing… | Decompressione… | Decomprimo… | 2/2 | 1.0 | 2/2 «Decomprimo» |
| `apps.chats.status.recording` | Recording… | Registrando... | Registrazione… | 14/14 | 1.0 | 14/14 «Registrazione» |
| `apps.chats.status.editing` | editing… | modifica in corso... | modifica… | 2/2 | 1.0 | 2/2 «modifica» |
| `apps.chats.tokenStatus.refreshing` | Refreshing… | Aggiornamento... | Aggiorno… | 1/1 | 1.0 | 1/1 «Aggiorno» |
| `apps.chats.toolCalls.infiniteMac.clicking` | Clicking… | Clic in corso… | Fare clic… | 1/1 | 1.0 | 1/1 «Fare clic» |
| `apps.chats.toolCalls.infiniteMac.resuming` | Resuming… | Ripresa in corso… | Riprendo… | 1/1 | 1.0 | 1/1 «Riprendo» |
| `common.activity.adding` | Adding | Aggiunta | Aggiungo | 2/2 | 1.0 | 2/2 «Aggiungo» |
| `common.dialog.adding` | Adding… | Aggiunta... | Aggiungo… | 2/2 | 1.0 | 2/2 «Aggiungo» |

### Auth, email, connectivity

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `common.auth.recovery.channelEmail` | Email | Email | E-mail | 63/63 | 1.0 | 63/63 «E-mail» |
| `apps.control-panels.email.title` | Email | Email | E-mail | 63/63 | 1.0 | 63/63 «E-mail» |
| `apps.contacts.cardLabels.email` | email | email | e-mail | 17/17 | 1.0 | 17/17 «e-mail» |
| `apps.contacts.fields.emails` | Email Addresses | Indirizzi email | Indirizzi e-mail | 2/2 | 1.0 | 2/2 «Indirizzi e-mail» |
| `apps.applet-viewer.dialogs.loginRequired` | Sign In Required | Accesso richiesto | È richiesto l'accesso | 3/3 | 1.0 | 3/3 «È richiesto l'accesso» |
| `apps.chats.status.loginRequired` | Sign In Required | Accesso richiesto | È richiesto l'accesso | 3/3 | 1.0 | 3/3 «È richiesto l'accesso» |
| `apps.chats.toasts.loginRequired` | Sign In Required | Accesso richiesto | È richiesto l'accesso | 3/3 | 1.0 | 3/3 «È richiesto l'accesso» |
| `apps.admin.offline.title` | Offline | Offline | Non in linea | 21/21 | 1.0 | 21/21 «Non in linea» |
| `debug.live.offline` | Offline | Offline | Non in linea | 21/21 | 1.0 | 21/21 «Non in linea» |

### System UI / menus / dock / full screen

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `common.appleMenu.enterFullScreen` | Enter Full Screen | Attiva schermo intero | Attiva modalità a tutto schermo | 58/58 | 1.0 | 58/58 «Attiva modalità a tutto schermo» |
| `common.appleMenu.noRecentDocuments` | No Recent Documents | Nessun documento recente | Non ci sono documenti recenti | 2/2 | 1.0 | 2/2 «Non ci sono documenti recenti» |
| `common.dock.turnHidingOn` | Turn Hiding On | Attiva nascondimento automatico | Attiva Nascondi | 2/2 | 1.0 | 2/2 «Attiva Nascondi» |
| `common.dock.turnHidingOff` | Turn Hiding Off | Disattiva nascondimento automatico | Disattiva Nascondi | 2/2 | 1.0 | 2/2 «Disattiva Nascondi» |
| `common.errorBoundaries.relaunch` | Relaunch | Riavvia | Riapri | 2/2 | 1.0 | 2/2 «Riapri» |
| `common.window.maximize` | Maximize | Ingrandisci | Massimizza | 1/1 | 1.0 | 1/1 «Massimizza» |
| `apps.control-panels.desktopAndScreenSaver` | Desktop & Screen Saver | Desktop e Salvaschermo | Scrivania e Salvaschermo | 1/1 | 1.0 | 1/1 «Scrivania e Salvaschermo» |
| `common.aboutThisMac.termsOfService` | Terms of Service | Termini di servizio | Termini del servizio | 1/1 | 1.0 | 1/1 «Termini del servizio» |
| `apps.control-panels.termsOfService` | Terms of Service | Termini di servizio | Termini del servizio | 1/1 | 1.0 | 1/1 «Termini del servizio» |

### App names & “About / Help” patterns

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.photo-booth.menu.aboutPhotoBooth` | About Photo Booth | Informazioni su Cabina fotografica | Informazioni su Photo Booth | 1/1 | 1.0 | 1/1 «Informazioni su Photo Booth» |
| `apps.photo-booth.menu.photoBoothHelp` | Photo Booth Help | Aiuto Cabina fotografica | Aiuto Photo Booth | 1/1 | 1.0 | 1/1 «Aiuto Photo Booth» |
| `apps.stickies.menu.about` | About Stickies | Informazioni su Stickies | Informazioni su Memo | 1/1 | 1.0 | 1/1 «Informazioni su Memo» |
| `apps.stickies.menu.help` | Stickies Help | Guida di Stickies | Aiuto Memo | 1/1 | 1.0 | 1/1 «Aiuto Memo» |
| `apps.dashboard.widgets.stickyNote` | Sticky Note | Nota adesiva | Memo | 1/1 | 1.0 | 1/1 «Memo» |
| `apps.contacts.menu.about` | About Contacts | Informazioni sui Contatti | Informazioni su Contatti | 1/1 | 1.0 | 1/1 «Informazioni su Contatti» |
| `apps.calculator.menu.about` | About Calculator | Informazioni sulla Calcolatrice | Informazioni su Calcolatrice | 1/1 | 1.0 | 1/1 «Informazioni su Calcolatrice» |

### TextEdit headings / font size

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.textedit.heading2` | Heading 2 | Intestazione 2 | Intestaz. 2 | 1/1 | 1.0 | 1/1 «Intestaz. 2» |
| `apps.textedit.heading3` | Heading 3 | Intestazione 3 | Intestaz. 3 | 1/1 | 1.0 | 1/1 «Intestaz. 3» |
| `apps.textedit.menu.heading1` | Heading 1 | Titolo 1 | Intestazione 1 | 1/1 | 1.0 | 1/1 «Intestazione 1» |
| `apps.textedit.menu.heading2` | Heading 2 | Titolo 2 | Intestaz. 2 | 1/1 | 1.0 | 1/1 «Intestaz. 2» |
| `apps.textedit.menu.heading3` | Heading 3 | Titolo 3 | Intestaz. 3 | 1/1 | 1.0 | 1/1 «Intestaz. 3» |
| `apps.textedit.slashCommands.heading2.title` | Heading 2 | Intestazione 2 | Intestaz. 2 | 1/1 | 1.0 | 1/1 «Intestaz. 2» |
| `apps.textedit.slashCommands.heading3.title` | Heading 3 | Intestazione 3 | Intestaz. 3 | 1/1 | 1.0 | 1/1 «Intestaz. 3» |
| `apps.chats.menu.increaseFontSize` | Increase Font Size | Aumenta Dimensione Carattere | Aumenta le dimensioni del font | 1/1 | 1.0 | 1/1 |
| `apps.chats.menu.decreaseFontSize` | Decrease Font Size | Riduci Dimensione Carattere | Riduci le dimensioni del font | 1/1 | 1.0 | 1/1 |
| `apps.terminal.menu.increaseFontSize` | Increase Font Size | Aumenta dimensione carattere | Aumenta le dimensioni del font | 1/1 | 1.0 | 1/1 |
| `apps.terminal.menu.decreaseFontSize` | Decrease Font Size | Riduci dimensione carattere | Riduci le dimensioni del font | 1/1 | 1.0 | 1/1 |

### Time / “Now” / TV status labels

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.internet-explorer.now` | Now | Ora | Adesso | 27/27 | 1.0 | 27/27 «Adesso» |
| `apps.internet-explorer.menu.now` | Now | Ora | Adesso | 27/27 | 1.0 | 27/27 «Adesso» |
| `apps.chats.tokenStatus.justNow` | just now | appena | proprio ora | 2/2 | 1.0 | 2/2 «proprio ora» |
| `apps.control-panels.autoSync.justNow` | just now | adesso | proprio ora | 2/2 | 1.0 | 2/2 «proprio ora» |
| `apps.tv.status.now` | NOW | ORA | ADESSO | 1/1 | 1.0 | 1/1 «ADESSO» |
| `apps.tv.status.next` | NEXT | SUCCESSIVO | AVANTI | 4/4 | 1.0 | 4/4 «AVANTI» |
| `apps.tv.status.time` | TIME | ORARIO | DURATA | 2/2 | 1.0 | 2/2 «DURATA» |

### Maps, media, screenshots, spotlight

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.maps.searchPlaceholder` | Search Maps | Cerca in Mappe | Cerca su Mappe | 2/2 | 1.0 | 2/2 «Cerca su Mappe» |
| `apps.maps.places.recents` | Recent Places | Luoghi recenti | Posizioni recenti | 2/2 | 1.0 | 2/2 «Posizioni recenti» |
| `apps.maps.poiCategory.atm` | ATM | Bancomat | ATM | 1/1 | 1.0 | 1/1 «ATM» |
| `apps.maps.poiCategory.fireStation` | Fire Station | Vigili del fuoco | Caserma dei Vigili del Fuoco | 1/1 | 1.0 | 1/1 |
| `apps.maps.poiCategory.fitnessCenter` | Fitness Center | Palestra | Centro fitness | 2/2 | 1.0 | 2/2 «Centro fitness» |
| `apps.infinite-mac.menu.captureScreenshot` | Capture Screenshot | Cattura Schermata | Scatta istantanea | 1/1 | 1.0 | 1/1 «Scatta istantanea» |
| `apps.infinite-mac.help.captureScreenshot.title` | Capture Screenshot | Cattura screenshot | Scatta istantanea | 1/1 | 1.0 | 1/1 «Scatta istantanea» |
| `apps.pc.menu.captureScreenshot` | Capture Screenshot | Cattura screenshot | Scatta istantanea | 1/1 | 1.0 | 1/1 «Scatta istantanea» |
| `spotlight.topHits` | Top Hits | Più rilevanti | Risultati migliori | 3/3 | 1.0 | 3/3 «Risultati migliori» |
| `apps.applet-viewer.sections.featured` | Featured | In evidenza | In primo piano | 11/11 | 1.0 | 11/11 «In primo piano» |

### Calculator / conversion / calendar / chats

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.calculator.menu.conversion` | Convert | Conversione | Converti | 24/24 | 1.0 | 24/24 «Converti» |
| `apps.calculator.conversion.swap` | Swap | Scambia | Scambio | 2/2 | 1.0 | 2/2 «Scambio» |
| `apps.calculator.conversion.units.yd` | Yards | Yarde | Iarde | 5/5 | 1.0 | 5/5 «Iarde» |
| `apps.calculator.conversion.units.oz` | Ounces | Ounce | Once | 6/6 | 1.0 | 6/6 «Once» |
| `apps.calculator.conversion.units.k` | Kelvin | Kelvin | Gradi Kelvin | 1/1 | 1.0 | 1/1 «Gradi Kelvin» |
| `apps.calculator.angle.degShort` | Deg | Gradi | Deg | 1/1 | 1.0 | 1/1 «Deg» |
| `apps.calculator.speech.keys.clearEntry` | clear entry | cancella immissione | cancella voce | 1/1 | 1.0 | 1/1 «cancella voce» |
| `apps.calculator.speech.keys.memoryClear` | memory clear | cancella memoria | cancella la memoria | 5/5 | 1.0 | 5/5 «cancella la memoria» |
| `apps.calendar.menu.monthView` | Month View | Mese | Vista mese | 1/1 | 1.0 | 1/1 «Vista mese» |
| `apps.calendar.menu.weekView` | Week View | Settimana | Vista settimana | 1/1 | 1.0 | 1/1 «Vista settimana» |
| `apps.calendar.event.startTime` | Start Time | Ora inizio | Inizio | 1/1 | 1.0 | 1/1 «Inizio» |
| `apps.calendar.tray.eventDetails` | Event Details | Dettagli evento | Dettagli attività | 1/1 | 1.0 | 1/1 «Dettagli attività» |
| `apps.calendar.tray.done` | done | completato | fine | 5/5 | 1.0 | 5/5 «fine» |
| `apps.chats.status.listening` | Listening | In ascolto | Ascolto | 2/2 | 1.0 | 2/2 «Ascolto» |
| `apps.chats.status.thinking` | Thinking | Elaborando | Un momento… | 1/1 | 1.0 | 1/1 «Un momento…» |
| `apps.chats.toolCalls.cursorCloudAgent.stream.thinking` | Thinking | Pensando | Un momento… | 1/1 | 1.0 | 1/1 «Un momento…» |
| `apps.chats.ariaLabels.leaveConversation` | Leave conversation | Abbandona conversazione | Abbandona la conversazione | 1/1 | 1.0 | 1/1 |
| `common.dialog.share.by` | by | da | per | 1/1 | 1.0 | 1/1 «per» |

### iPod / videos / paint / photo booth / synth / admin

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.ipod.menu.displayGradient` | Gradient | Sfumatura | Gradiente | 7/7 | 1.0 | 7/7 «Gradiente» |
| `apps.ipod.menu.fontGradient` | Gradient | Sfumatura | Gradiente | 7/7 | 1.0 | 7/7 «Gradiente» |
| `apps.ipod.menu.multi` | Multi | Multiplo | Multi | 10/10 | 1.0 | 10/10 «Multi» |
| `apps.ipod.dialogs.noUpdates` | No Updates | Nessun aggiornamento | 0 aggiornamenti | 1/1 | 1.0 | 1/1 «0 aggiornamenti» |
| `apps.videos.menu.resetLibrary` | Reset Library… | Reimposta libreria... | Inizializza libreria… | 1/1 | 1.0 | 1/1 «Inizializza libreria» |
| `apps.tv.menu.closedCaptions` | Closed Captions | Sottotitoli per non udenti | Sottotitoli non udenti | 2/2 | 1.0 | 2/2 |
| `apps.paint.menu.filterCategoryArtistic` | Artistic | Artistici | Artistico | 1/1 | 1.0 | 1/1 «Artistico» |
| `apps.paint.menu.filterGaussianBlur` | Gaussian Blur | Sfocatura Gaussiana | Sfumatura gaussiana | 1/1 | 1.0 | 1/1 «Sfumatura gaussiana» |
| `apps.paint.menu.filterPixelate` | Pixelate | Pixelizza | Suddividi in pixel | 1/1 | 1.0 | 1/1 «Suddividi in pixel» |
| `apps.photo-booth.effects.twirl` | Twirl | Vortice | Piroetta | 1/1 | 1.0 | 1/1 «Piroetta» |
| `apps.photo-booth.effects.squeeze` | Squeeze | Schiacciamento | Schiacciatura | 1/1 | 1.0 | 1/1 «Schiacciatura» |
| `apps.photo-booth.effects.fishEye` | Fish Eye | Fisheye | Fish Eye | 1/1 | 1.0 | 1/1 «Fish Eye» |
| `apps.synth.effectsParams.delay` | Delay | Delay | Ritardo | 4/4 | 1.0 | 4/4 «Ritardo» |
| `apps.control-panels.terminalIeAmbientSynth` | Synth | Synth | Sintetizzatore | 1/1 | 1.0 | 1/1 «Sintetizzatore» |
| `apps.control-panels.screenSaverOptions.matrix.name` | Matrix | Matrix | Matrice | 3/3 | 1.0 | 3/3 «Matrice» |
| `apps.karaoke.help.keyboardShortcuts.title` | Keyboard Shortcuts | Scorciatoie da tastiera | Abbreviazioni da tastiera | 7/7 | 1.0 | 7/7 «Abbreviazioni da tastiera» |
| `apps.admin.name` | Admin | Admin | Amministratore | 5/5 | 1.0 | 5/5 «Amministratore» |
| `apps.admin.cursorAgents.colTask` | Task | Task | Attività | 12/12 | 1.0 | 12/12 «Attività» |
| `apps.admin.song.source` | Source | Fonte | Sorgente | 22/22 | 1.0 | 22/22 «Sorgente» |
| `apps.contacts.fields.source` | Source | Origine | Sorgente | 22/22 | 1.0 | 22/22 «Sorgente» |
| `apps.admin.profile.clearAll` | Clear All | Cancella tutto | Elimina tutti | 1/1 | 1.0 | 1/1 «Elimina tutti» |
| `apps.stickies.help.clearAll.title` | Clear All | Cancella tutto | Elimina tutti | 1/1 | 1.0 | 1/1 «Elimina tutti» |
| `apps.admin.profile.pending` | pending | in attesa | in sospeso | 3/3 | 1.0 | 3/3 «in sospeso» |
| `apps.admin.server.notConfigured` | Not configured | Non configurato | Non configurata | 2/2 | 1.0 | 2/2 «Non configurata» |
| `apps.admin.server.unhealthy` | Unhealthy | Non integro | Nociva | 2/2 | 1.0 | 2/2 «Nociva» |
| `apps.admin.redis.root` | root | radice | root | 1/1 | 1.0 | 1/1 «root» (technical; current «radice» may be preferable) |
| `apps.contacts.groups.imported` | Imported | Importati | Importato | 3/3 | 1.0 | 3/3 «Importato» |
| `apps.books.shelf.gridView` | Grid View | Vista a griglia | Vista griglia | 3/3 | 1.0 | 3/3 «Vista griglia» |
| `apps.control-panels.setup` | Setup | Configura | Configurazione | 2/2 | 1.0 | 2/2 «Configurazione» |
| `apps.internet-explorer.fetch` | Fetch | Recupera | Scarica | 1/1 | 1.0 | 1/1 «Scarica» |
| `apps.internet-explorer.olderVersion` | Older Version | Versione precedente | Versione più vecchia | 1/1 | 1.0 | 1/1 «Versione più vecchia» |
| `apps.soundboard.description` | Play sound effects | Riproduci effetti sonori | Riproduci effetti audio | 1/1 | 1.0 | 1/1 «Riproduci effetti audio» |
| `common.htmlPreview.split` | Split | Divisa | Suddividi | 1/1 | 1.0 | 1/1 «Suddividi» |
| `common.htmlPreview.full` | Full | Intera | Completo | 1/1 | 1.0 | 1/1 «Completo» |
| `debug.live.current` | Current | Corrente | Attuale | 9/9 | 1.0 | 9/9 «Attuale» |
| `debug.live.logging` | Logging | Logging | Log | 4/4 | 1.0 | 4/4 «Log» |
| `debug.live.metric` | Metric | Metrica | Metrico | 2/2 | 1.0 | 2/2 «Metrico» |

### Create-account menu items (nomenclature + mixed ellipsis)

| Key | English | Current | Recommended | Apple count | Conf | Context |
|-----|---------|---------|-------------|-------------|------|---------|
| `apps.applet-viewer.menu.createAccount` | Create Account… | Crea Account... | Crea account… | 5/5 | 1.0 | 5/5 «Crea account» |
| `apps.chats.menu.createAccount` | Create Account… | Crea Account... | Crea account… | 5/5 | 1.0 | 5/5 «Crea account» |

---

## Context collisions (401) — not high-confidence

These English strings appear in AppleGlot with **fragmented** translations (dominant &lt; 80% or &gt; 3 alternatives). **346/401** already use a translation that appears somewhere in Apple’s alt set — often intentional ryOS wording.

**Distribution:** 393 with confidence &lt; 0.5; 8 in 0.5–0.8 band; **0** with ≥ 0.8 and &gt; 3 alts.

**Most fragmented bases:** Search (8), Save (7), Back (7), Previous/Next (7 each), Auto (6), Full Screen (6), Cancel (6), Open/Play/Pause (6 each).

**Representative 50% collisions (current may be valid):**

| Key | English | Current | Dominant Apple | Conf | Context |
|-----|---------|---------|----------------|------|---------|
| `apps.chats.toolCalls.cursorCloudAgent.stream.userPrompt` | Prompt | Prompt | Titolo | 0.5 | Richiesta 6 / Titolo 6 |
| `apps.paint.name` | Paint | Disegno | Rendering | 0.5 | Paint 1 / Rendering 1 |
| `apps.maps.menu.hybrid` | Hybrid | Ibrida | Ibrido | 0.5 | Ibrida 2 / Ibrido 2 |
| `common.auth.recovery.mismatch` | Passwords do not match | Le password non corrispondono | Le password non coincidono. | 0.5 | coincidono variants 4+4 |

---

## English leaks

**Raw:** 213 keys where `it === en` with Latin text. Many are intentional (product names, `Photo Booth`, `iPod`, `Markdown`, geographic names, `Stop`, `Reset`, `Account` as brand-like label).

**Actionable after filtering (~133):** includes `Delay` → Ritardo, `Account` → Account (Apple uses localized forms in some contexts), `Fahrenheit`/`Celsius`, `Viewport`, `Debug`, `Markdown`, `Listen Party`, `Ban`, geographic names (`Canada`, `Hong Kong`, `New York`), synth params, etc. These did **not** hit exact-base high-confidence rules because the English string either doesn’t appear as a standalone Apple base or Apple also leaves them English.

---

## Placeholders & plurals

- **Placeholders:** 0 issues (all `{{count}}`, `{{name}}`, etc. preserved).
- **Plurals:** Italian `one`/`other` forms present for all English plural keys; 0 missing CLDR forms.
- **Punctuation policy:** Apple consistently uses Unicode ellipsis `…`; Italian file often uses ASCII `...` (74 punctuation-only divergences across all exact matches, including high-confidence rows above).

---

## Priority recommendations (if aligning to AppleGlot)

1. **Batch fix ellipsis:** `...` → `…` on menu items with trailing ellipsis (11 pure + many progress strings).
2. **Progress verbs:** Apple Italian favors first-person present (`Carico…`, `Salvo…`, `Invio…`) over “X in corso…” / “Caricamento…”.
3. **High-impact system strings:** `Enter Full Screen` → `Attiva modalità a tutto schermo` (58/58); `Email` → `E-mail` (63/63); dock hide/magnify menu items.
4. **App marketing names:** `Photo Booth`, `Stickies`/`Memo`, `Photo Booth Help` — Apple keeps English app names in Italian.
5. **Do not auto-apply:** Offset/Brick/Score false positives; `Unhealthy` → `Nociva` (server health vs Apple’s unrelated “Nociva”); `Thinking` → `Un momento…` (AI status vs Apple wait message).

The repo’s **113-term curated audit already passes**; the 179 high-confidence full-catalog findings are mostly **style patterns** and **extended glossary coverage** beyond that curated set, not regressions in core macOS chrome terminology.

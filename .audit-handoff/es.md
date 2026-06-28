# Spanish (es) AppleGlot Full-Catalog Audit

**Source:** `/Users/ryo/Downloads/Glossaries/Spanish.dmg` (mounted at `/Volumes/Spanish`)  
**SHA256:** `f6ccd762ad5d69c62f05cb2c9888176fca3a12ac15ac8d1258380a17b6210302` — matches `scripts/apple-ui-terminology-data.ts`  
**Target:** `src/lib/locales/es/translation.json` vs `src/lib/locales/en/translation.json`  
**Method:** Parsed all 679 `.lg` XML files (~125k unique English bases). For each ryOS key whose English value exactly matches an Apple `<base loc="en">`, compared Spanish against the dominant Apple `<tran loc="es">` (highest count). High confidence = dominant count ≥ 5 and ≥ 55% of all variants for that base. Context collisions = same base with 2+ Apple variants where ryOS text matches none of them. Built-in `scripts/audit-translations.ts` passes for `es` (0 issues) because its curated term list (~116 bases, 241 key hits) is already aligned.

---

## Total metrics

| Metric | Count |
|--------|------:|
| English keys | 3,754 |
| Spanish keys | 3,758 |
| Apple glossary unique English bases | 125,311 |
| Apple `.lg` files parsed | 679 |
| ryOS keys with exact Apple base match | 1,357 |
| → Match Apple dominant translation | 1,021 |
| → Match valid non-dominant Apple variant | 88 |
| → High-confidence mismatch (total) | **83** |
|   Nomenclature (single dominant variant) | 50 |
|   Context collision (multi-variant base) | 33 |
| Curated Apple UI term key checks | 241 |
| Curated mismatches | **0** |
| Ellipsis punctuation (`...` vs `…`) | 21 keys |
| Casing-only drift | 5 |
| Actionable English leaks (identical EN, Apple has ES) | 11 |
| Placeholder mismatches | **0** |
| Missing CLDR plural forms | **0** |
| `[TODO]` markers | **0** |
| Missing keys vs English | **0** |
| Extra Spanish-only keys | 4 (`*_many` plural forms) |

**Coverage note:** Only ~36% of ryOS keys (1,357/3,754) have an exact English string in the full Apple catalog. The rest are product-specific copy, sentences, or non-macOS UI strings with no Apple base to match.

---

## High-confidence nomenclature mismatches (50)

Dominant Apple variant is unambiguous (1 glossary variant, or one variant ≥ 55%). Includes 18 ellipsis-only fixes and 32 semantic term fixes.

### Ellipsis / punctuation (18)

| Key | Current | Recommended | Apple count | Confidence | Context |
|-----|---------|-------------|------------:|------------|---------|
| `common.loading.default` | Cargando... | Cargando… | 68/68 | high | iCloud download progress label |
| `common.auth.loggingIn` | Iniciando sesión... | Iniciando sesión… | 5/5 | high | Signing-in status field |
| `common.auth.changePassword.saving` | Guardando... | Guardando… | 9/9 | high | Saving status |
| `common.auth.recovery.sending` | Enviando... | Enviando… | 6/6 | high | Sending state text |
| `apps.finder.messages.loading` | Cargando... | Cargando… | 68/68 | high | iCloud download label |
| `apps.internet-explorer.loadingEllipsis` | Cargando... | Cargando… | 68/68 | high | iCloud download label |
| `apps.internet-explorer.menu.addToFavorites` | Añadir a favoritos... | Añadir a favoritos… | 16/16 | high | NSMenuItem Add to Favorites |
| `apps.ipod.dialogs.lyricsSearchSearching` | Buscando... | Buscando… | 23/23 | high | Find bar in-progress |
| `apps.ipod.dialogs.songSearchSearching` | Buscando... | Buscando… | 23/23 | high | Find bar in-progress |
| `apps.applet-viewer.dialogs.loading` | Cargando... | Cargando… | 68/68 | high | iCloud download label |
| `apps.control-panels.loggingOut` | Cerrando sesión... | Cerrando sesión… | 5/5 | high | Signing-out status |
| `apps.control-panels.recoveryEmail.saving` | Enviando... | Enviando… | 6/6 | high | Sending state text |
| `apps.control-panels.telegram.disconnecting` | Desconectando... | Desconectando… | 9/9 | high | Bluetooth disconnect / IM status |
| `apps.control-panels.telegram.preparing` | Preparando... | Preparando… | 24/24 | high | Progress proxy initial state |
| `apps.control-panels.telegram.savingInstructions` | Guardando... | Guardando… | 9/9 | high | Saving status |
| `apps.dashboard.stocks.searching` | Buscando... | Buscando… | 23/23 | high | Find bar in-progress |
| `apps.dashboard.weather.searching` | Buscando... | Buscando… | 23/23 | high | Find bar in-progress |
| `apps.admin.redis.loading` | Cargando... | Cargando… | 68/68 | high | iCloud download label |

### Semantic terminology (32)

| Key | Current | Recommended | Apple count | Confidence | Context |
|-----|---------|-------------|------------:|------------|---------|
| `common.dialog.discardChanges` | Descartar cambios | No guardar cambios | 21/21 | high | Discard-changes button at quit |
| `common.appleMenu.recentItems` | Elementos Recientes | Ítems recientes | 5/5 | high | Recent Items popup a11y label |
| `common.appleMenu.enterFullScreen` | Entrar en pantalla completa | Usar pantalla completa | 58/58 | high | Enter Full Screen menu item |
| `apps.finder.statusBar.item` | elemento | ítem | 11/11 | high | Generic “item” count label |
| `apps.finder.statusBar.items` | elementos | ítems | 15/15 | high | Generic “items” count label |
| `apps.chats.toolCalls.ipodPaused` | Pausado | En pausa | 22/22 | high | Playback/accessibility paused state |
| `apps.chats.toolCalls.cursorCloudAgent.stream.userPrompt` | Prompt | Mensaje | 12/12 | high | Automator prompt label |
| `apps.chats.toolCalls.settingsCheckingForUpdates` | Buscando actualizaciones… | Comprobando actualizaciones… | 5/5 | high | Version-check strings |
| `apps.chats.toolCalls.infiniteMac.paused` | Pausado | En pausa | 22/22 | high | Playback paused state |
| `apps.textedit.dialogs.discardChanges` | Descartar cambios | No guardar cambios | 21/21 | high | Discard-changes button |
| `apps.paint.dialogs.discardChanges` | Descartar cambios | No guardar cambios | 21/21 | high | Discard-changes button |
| `apps.ipod.menu.multi` | Múltiple | Multi | 10/10 | high | Audio channel mode (AMPLibrary) |
| `apps.ipod.menu.addToFavorites` | Añadir a Favoritos | Añadir a favoritos | 16/16 | high | Add to Favorites menu |
| `apps.ipod.brickGame.paused` | Pausa | En pausa | 22/22 | high | Paused state |
| `apps.karaoke.help.keyboardShortcuts.title` | Atajos de teclado | Funciones rápidas de teclado | 7/7 | high | Keyboard Shortcuts menu/title |
| `apps.control-panels.accountsTabs.debug` | Depuración | Depurar | 23/23 | high | Debug menu item |
| `apps.control-panels.telegram.manage` | Administrar | Gestionar | 8/8 | high | Manage button |
| `apps.control-panels.autoSync.uploading` | Subiendo | Cargando | 5/5 | high | iCloud upload badge |
| `apps.control-panels.cloudSync.forceUploading` | Subiendo… | Cargando… | 5/5 | high | iCloud upload badge |
| `apps.infinite-mac.menu.scaling` | Escalado | Escala | 8/8 | high | Scaling menu |
| `apps.calendar.menu.newEvent` | Nuevo Evento | Nuevo evento | 13/13 | high | New Event menu item |
| `apps.contacts.fields.lastName` | Apellido | Apellidos | 22/22 | high | Contacts family-name field |
| `apps.contacts.fields.nickname` | Apodo | Alias | 30/30 | high | Address Book nickname |
| `apps.admin.name` | Admin | Administrador | 5/5 | high | Admin role label |
| `apps.admin.sidebar.private` | Privada | Privado | 7/7 | high | Network access type |
| `apps.admin.user.admin` | administrador | Administrador | 5/5 | high | Admin role (casing) |
| `apps.admin.tableHeaders.role` | Rol | Función | 13/13 | high | NSTableColumn “Role” |
| `apps.maps.placeCard.addFavorite` | Añadir a Favoritos | Añadir a favoritos | 16/16 | high | Add to Favorites |
| `apps.books.shelf.listView` | Vista de lista | Visualización como lista | 8/8 | high | List View menu item |
| `apps.calculator.menu.conversion` | Conversión | Convertir | 24/24 | high | Convert button (Calculator) |
| `apps.calculator.conversion.from` | Desde | De | 26/26 | high | Conversion “From” field |
| `debug.toggleLabel` | Depuración | Depurar | 23/23 | high | Debug menu item |

**Strongest semantic fixes (100% Apple consensus):** `Enter Full Screen` → Usar pantalla completa (58/58), `Discard Changes` → No guardar cambios (21/21), `Paused` → En pausa (22/22), `Nickname` → Alias (30/30), `Convert` → Convertir (24/24), `From` → De (26/26).

---

## High-confidence context collisions (33)

Apple documents 2+ Spanish variants for the same English base. ryOS current text appears in **none** of them (not even as a secondary variant). Listed with dominant recommendation and top alternatives.

| Key | Current | Recommended | Apple count | Confidence | Apple variants (count) | Notes |
|-----|---------|-------------|------------:|------------|------------------------|-------|
| `common.colors.purple` | púrpura | morado | 5/7 | high | morado(5), violeta(2) | Color name; Apple prefers *morado* |
| `common.dialog.share.itemTypes.item` | Elemento | Ítem | 46/60 | high | Ítem(46), Item(13), ítem(1) | Table column “Item” |
| `common.startMenu.run` | Ejecutar... | Ejecutar… | 19/25 | high | Ejecutar…(19), + ellipsis variants | Ellipsis + variant |
| `apps.finder.menu.rename` | Renombrar... | Renombrar… | 12/14 | high | Renombrar…(12), Cambiar nombre…(2) | |
| `apps.chats.status.recording` | Grabando... | Grabando… | 8/14 | high | Grabando…(8), + others | Ellipsis |
| `apps.paint.menu.filterSharpen` | Enfocar | Nitidez | 5/8 | high | Nitidez(5), Dar nitidez(3) | Filter name vs verb |
| `apps.minesweeper.lcd.left` | Restantes | Izquierda | 57/75 | high | Izquierda(57), Izquierdo(16), A la izquierda(2) | **Wrong sense:** “Left” not “Remaining” |
| `apps.videos.dialogs.videoItemType` | Video | Vídeo | 65/67 | high | Vídeo(65), vídeo(2) | Accent |
| `apps.ipod.menu.single` | Individual | Sencillo | 11/12 | high | Sencillo(11), Una sola(1) | Audio mode |
| `apps.ipod.menu.video` | Video | Vídeo | 65/67 | high | Vídeo(65), vídeo(2) | Accent |
| `apps.ipod.menuItems.nowPlaying` | Reproduciendo ahora | En reproducción | 9/12 | high | En reproducción(9), Ahora suena(3) | Now Playing |
| `apps.ipod.menuItems.recentlyAdded` | Añadidas recientemente | Añadido recientemente | 11/12 | high | Añadido recientemente(11), Recientes(1) | Gender agreement |
| `apps.karaoke.liveListen.playbackBadge` | Repro | Reproducir | 102/113 | high | Reproducir(102), Jugar(10), Reprod.(1) | Play button |
| `apps.karaoke.liveListen.hostLabel` | Anfitrión | Host | 11/12 | high | Host(11), Presentador(1) | Apple keeps *Host* |
| `apps.applet-viewer.sections.featured` | Destacados | Destacado | 10/11 | high | Destacado(10), Destacada(1) | |
| `apps.control-panels.accentColors.teal` | Turquesa | Verde azulado | 6/9 | high | Verde azulado(6), Verde bosque(2), Teal(1) | Accent color name |
| `apps.control-panels.email.link` | Vincular | Enlace | 12/18 | high | Enlace(12), Enlazar(5), Link(1) | Noun vs verb |
| `apps.control-panels.default` | Predeterminado | Por omisión | 99/100 | high | Por omisión(99), Codificación por omisión(1) | Classic macOS ES term |
| `apps.control-panels.dynamicWallpapers.weather` | Clima | Tiempo | 9/11 | high | Tiempo(9), meteorológica(1), tiempo(1) | Weather widget |
| `apps.control-panels.dynamicWallpapers.nowPlaying` | Reproduciendo ahora | En reproducción | 9/12 | high | En reproducción(9), Ahora suena(3) | |
| `apps.winamp.skins.default` | Predeterminado | Por omisión | 99/100 | high | Por omisión(99) | Same as above |
| `apps.contacts.cardLabels.url` | URL | url | 6/7 | high | url(6), dirección URL(1) | Apple lowercases label |
| `apps.dashboard.name` | Panel | Dashboard | 5/6 | high | Dashboard(5), Tablero(1) | Apple leaves untranslated |
| `apps.dashboard.title` | Panel | Dashboard | 5/6 | high | Dashboard(5), Tablero(1) | |
| `apps.dashboard.ipod.nowPlaying` | Reproduciendo ahora | En reproducción | 9/12 | high | En reproducción(9), Ahora suena(3) | |
| `apps.admin.dashboard.title` | Panel de control | Dashboard | 5/6 | high | Dashboard(5), Tablero(1) | |
| `apps.admin.sidebar.dashboard` | Panel | Dashboard | 5/6 | high | Dashboard(5), Tablero(1) | |
| `apps.admin.cursorAgents.startAgent` | Ejecución | Ejecutar | 19/25 | high | Ejecutar(19), Run(4), Correr(2) | Verb vs noun |
| `apps.books.columns.single` | Sencilla | Sencillo | 11/12 | high | Sencillo(11), Una sola(1) | Gender |
| `apps.calculator.speech.keys.equals` | igual | igual a | 9/12 | high | igual a(9), es igual a(3) | VoiceOver key |
| `apps.calculator.speech.keys.log` | log | registro | 5/7 | high | registro(5), logaritmo(2) | |
| `apps.calculator.conversion.to` | Hasta | Para | 15/21 | high | Para(15), A(6) | Conversion “To” field |
| `settings.language.english` | English | Inglés | 20/22 | high | Inglés(20), Español(2) | Language name in picker |

**Collision triage:**  
- **Clear errors:** `apps.minesweeper.lcd.left` (semantic mismatch), `Video`→`Vídeo`, ellipsis keys in collision list.  
- **Debatable / product choice:** `Panel` vs `Dashboard`, `Predeterminado` vs `Por omisión`, `Anfitrión` vs `Host` — ryOS may intentionally prefer more natural modern Spanish over literal AppleGlot choices.

---

## Valid non-dominant Apple variants (88) — not flagged as mismatches

These keys use a documented Apple translation that is not the most frequent variant. Often contextually correct; repo already whitelists some (e.g. `apps.admin.server.ok` → OK vs dominant Aceptar).

Examples:

| Key | Current (Apple-valid) | Dominant alternative | Current count | Dominant count |
|-----|----------------------|---------------------|--------------:|---------------:|
| `common.aboutThisMac.virtualMemoryOff` | Desactivado | No | 128 | 196 |
| `common.menu.edit` | Editar | Edición | 79 | 320 |
| `apps.admin.server.ok` | OK | Aceptar | 60 | 978 |
| `common.menu.view` | Ver | Visualización | 17 | 254 |
| `apps.control-panels.accentColors.purple` | Morado | Violeta | 20 | 23 |

---

## Casing issues (5)

Same lemma as Apple dominant; wrong capitalization only:

| Key | Current | Recommended |
|-----|---------|-------------|
| `apps.ipod.menu.addToFavorites` | Añadir a Favoritos | Añadir a favoritos |
| `apps.calendar.menu.newEvent` | Nuevo Evento | Nuevo evento |
| `apps.contacts.cardLabels.url` | URL | url |
| `apps.admin.user.admin` | administrador | Administrador |
| `apps.maps.placeCard.addFavorite` | Añadir a Favoritos | Añadir a favoritos |

---

## Actionable English leaks (11)

Identical to English where AppleGlot has a Spanish translation (excluding intentional product names like Finder, Spotlight, Chats):

| Key | Current | Recommended | Apple count |
|-----|---------|-------------|------------:|
| `apps.videos.dialogs.videoItemType` | Video | Vídeo | 65 |
| `apps.ipod.menu.video` | Video | Vídeo | 65 |
| `apps.ipod.menuItems.brickGame` | Brick | Ladrillo | 1 |
| `apps.ipod.translationLanguages.auto` | Auto | Automático | 44 |
| `apps.synth.effectsParams.chorus` | Chorus | Coral | 4 |
| `apps.control-panels.timezoneAutomatic` | Auto | Automático | 44 |
| `apps.control-panels.terminalIeAmbientSynth` | Synth | Sintetizador | 1 |
| `apps.control-panels.screenSaverOptions.matrix.name` | Matrix | Matriz | 3 |
| `apps.admin.name` | Admin | Administrador | 5 |
| `apps.calculator.speech.keys.log` | log | registro | 5 |
| `settings.language.english` | English | Inglés | 20 |

~234 additional keys are identical to English but are intentional (app names, geography, usernames, `ryOS {{version}}`, Wi‑Fi, AirDrop, etc.).

---

## Placeholders, plurals, structural

| Check | Result |
|-------|--------|
| `{{…}}` placeholder parity | **0 issues** — all placeholders match English |
| CLDR plural forms for `es` | **0 missing** (Spanish uses `one` + `other`; all present) |
| Extra `*_many` keys in ES | 4 keys (harmless; Spanish does not use `many`) |
| `[TODO]` | **0** |

---

## Priority summary

1. **Quick wins (21 keys):** Replace `...` with `…` on loading/saving/searching strings.  
2. **High-impact semantic (≈15 keys):** `Discard Changes`, `Enter Full Screen`, `Paused`→`En pausa`, `Video`→`Vídeo`, `Item`→`Ítem`, `Uploading`→`Cargando`, minesweeper `Left`.  
3. **Review before changing (≈10 keys):** Dashboard/Panel, Predeterminado/Por omisión, Host/Anfitrión, Keyboard Shortcuts wording — product tone may override AppleGlot.  
4. **Already clean:** Curated 241-term Apple UI checklist, placeholders, plurals, TODOs.

Switch to Agent mode if you want these applied automatically or a focused fix PR scoped to nomenclature-only vs ellipsis-only.

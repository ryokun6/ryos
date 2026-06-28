# Brazilian Portuguese (pt) — Full AppleGlot Glossary Audit

Read-only audit of `src/lib/locales/pt/translation.json` against `src/lib/locales/en/translation.json` and the official AppleGlot macOS **Brazilian Portuguese** glossary (`Brazilian.dmg`, SHA256 `04400ea7164d23b6583a8618669d4c9bccefe34ed416586ead86d17d93bce140`, matching `scripts/apple-ui-terminology-data.ts`).

**Method:** Parsed all 679 `.lg` files (258,881 `TranslationSet` entries → 125,717 unique English bases). For each of 3,754 flat keys, matched English values exactly (or with trailing `…`/`...` stripped). Dominant Apple translation = highest-count `tran` (confidence = count/total). High-confidence threshold: ≥80%. Applied `APPLE_UI_CONTEXTUAL_TERMINOLOGY` overrides from `scripts/apple-ui-terminology.ts` where keyed.

---

## Metrics

| Metric | Value |
|--------|------:|
| English keys | 3,754 |
| Portuguese keys | 3,758 |
| Extra pt-only keys | 4 |
| Glossary `.lg` files | 679 |
| Unique Apple English bases | 125,717 |
| Catalog keys hitting glossary (exact/ellipsis) | 1,357 (36.1%) |
| Exact Apple match | 1,049 |
| High-confidence mismatch (≥80%) | 200 |
| — punctuation-only (`...` vs `…`) | 35 |
| — casing-only | 15 |
| — content/nomenclature | 150 |
| High-conf where pt = documented Apple alt | 19 |
| Context collision (<80% dominant) | 89 |
| Curated audit (`bun run i18n:audit`) pt issues | **0** (114 hand-picked terms) |
| European Portuguese markers (heuristic) | 17 unique keys / ~90+ string hits |
| Identical to English (untranslated) | 174 (116 likely intentional brands) |
| `[TODO]` markers | 0 |
| Placeholder mismatches | 0 |
| Plural defects | 4 extra `_many` keys |
| ASCII ellipsis violations | ~120 total |

---

## Curated vs full-catalog gap

The repo’s `scripts/audit-translations.ts` only checks ~114 Apple UI terms via `getExpectedAppleUiTerm()`. That suite **passes cleanly** for pt. The full-catalog scan surfaces **308 additional deviations** where English UI strings exist in AppleGlot but are not in the curated term list — mostly menu labels, status strings, weather terms, and compound phrases.

---

## A. High-confidence nomenclature mismatches (≥80%, 150 content items)

Below: every content mismatch after excluding pure ellipsis and casing-only diffs. Format: **key** → pt **/** Apple (confidence).

### A1. Systematic Search / update vocabulary (Apple: **Buscar**)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.finder.placeholders.search` | Search | Pesquisar | Buscar (96.9%) |
| `apps.internet-explorer.search` | Search | Pesquisar | Buscar |
| `apps.ipod.dialogs.lyricsSearchSearch` | Search | Pesquisar | Buscar |
| `apps.ipod.dialogs.songSearchSearch` | Search | Pesquisar | Buscar |
| `apps.ipod.lyrics.search` | Search | Procurar | Buscar |
| `apps.karaoke.lyrics.search` | Search | Procurar | Buscar |
| `apps.dashboard.dictionary.searchPlaceholder` | Search… | Pesquisar… | Buscar… |
| `apps.dashboard.stocks.searching` | Searching… | Pesquisando... | Buscando… |
| `apps.dashboard.weather.searching` | Searching… | Pesquisando... | Buscando… |
| `apps.ipod.dialogs.lyricsSearchSearching` | Searching… | Pesquisando... | Buscando… |
| `apps.ipod.dialogs.songSearchSearching` | Searching… | Pesquisando... | Buscando… |
| `apps.chats.toolCalls.settingsCheckingForUpdates` | Checking for updates… | Verificando atualizações… | Buscando atualizações… |
| `apps.applet-viewer.menu.checkForUpdates` | Check for Updates | Verificar Atualizações | Buscar Atualizações |
| `apps.control-panels.checkForUpdates` | Check for Updates | Verificar Atualizações | Buscar Atualizações |

### A2. Delete vocabulary (Apple: **Apagar**, not Excluir)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.admin.profile.delete` | Delete User | Excluir Usuário | Apagar Usuário |
| `apps.contacts.menu.deleteContact` | Delete Contact | Excluir Contato | Apagar Contato |
| `apps.control-panels.deleteAccount.title` | Delete Account | Excluir conta | Apagar Conta |
| `apps.control-panels.deleteAccount.submit` | Delete Account | Excluir conta | Apagar Conta |
| `apps.control-panels.deleteAccountMenu` | Delete Account… | Excluir conta… | Apagar Conta… |
| `apps.control-panels.deleteAccount.deleting` | Deleting… | Excluindo... | Apagando… |
| `apps.stickies.menu.deleteNote` | Delete Note | Excluir Nota | Apagar Nota |

### A3. Room / Rooms (Apple: **Cômodo(s)** — chat context uses “Sala” in pt)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.admin.profile.room` | Room | Sala | Cômodo |
| `apps.admin.profile.rooms` | Rooms | Salas | Cômodos |
| `apps.admin.sidebar.rooms` | Rooms | Salas | Cômodos |
| `apps.chats.sidebar.rooms` | Rooms | Salas | Cômodos |
| `apps.chats.menu.showRooms` | Show Rooms | Mostrar Salas | Mostrar Cômodos |

### A4. European Portuguese register (high-confidence Apple BR conflicts)

| Key | EN | PT (evidence) | Apple |
|-----|----|---------------|-------|
| `apps.admin.sidebar.users` | Users | **Utilizadores** | Usuários |
| `common.appleMenu.enterFullScreen` | Enter Full Screen | Entrar em **ecrã** inteiro | Entrar em Tela Cheia |
| `apps.control-panels.autoSync.openSettings` | Sync Settings… | **Definições** de sincronização… | Ajustes de Sincronização… |
| `apps.internet-explorer.loadingEllipsis` | Loading… | **A carregar**... | Carregando… |
| `common.auth.creatingAccount` | Creating… | **A criar**... | Criando… |
| `apps.control-panels.loggingOut` | Signing out… | **A terminar sessão**... | Finalizando a sessão… |
| `common.auth.loggingIn` | Signing in… | **A iniciar sessão**... | Iniciando Sessão… |
| `apps.dashboard.ipod.nowPlaying` | Now Playing | **A Reproduzir** | Reproduzindo |
| `apps.ipod.menuItems.nowPlaying` | Now Playing | **A Reproduzir** | Reproduzindo |
| `apps.control-panels.dynamicWallpapers.nowPlaying` | Now Playing | Reproduzindo agora | Reproduzindo |

Additional EU-PT hits **without** exact glossary base match (still flagged):

- `apps.admin.messages.userDeleted` — **Utilizador** … **eliminado**
- `apps.admin.search.noResults` — Nenhum **utilizador** encontrado
- `apps.admin.search.placeholder` — Pesquisar **utilizadores**...
- `apps.finder.menu.import` — Importar **ficheiro**…
- `apps.control-panels.backupRestoreDescription` — **definições** e **ficheiros**
- `apps.control-panels.resetAllSettings` — Redefinir Todas as **Definições**
- `common.auth.setPasswordRequired` — **Palavra-passe**
- `common.auth.setPasswordRequiredDescription` — **palavra-passe** … **terminar sessão** … **pode recuperar**
- `common.auth.signupDescription` — **aceder** … **guardar** … **definições**
- `common.htmlPreview.downloadHtml` — **Descarregar** HTML
- `common.htmlPreview.saveApplet` / toast keys — **Guardar**
- `apps.chats.toolCalls.ipodAdded` (+2 keys) — **Prima** o botão (PT-PT imperative)
- `apps.dashboard.name` / `.title` — **Painel de Controlo** (Apple: Dashboard 83.3%)
- `apps.dashboard.cities.newYork` — **Nova Iorque** (Apple: Nova York)
- `apps.dashboard.cities.sanFrancisco` — **São Francisco** (Apple: San Francisco)
- `apps.dashboard.cities.taipei` — **Taipé** (Apple: Taipei)

### A5. Sync / verb-vs-noun (Apple wants infinitive **Sincronizar**)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.control-panels.sync` | Sync | Sincronização | Sincronizar |
| `apps.control-panels.cloudSyncTabs.sync` | Sync | Sincronização | Sincronizar |

### A6. Now Playing / playback status

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.ipod.menuItems.signedIn` | Signed In | Sessão Iniciada | Conectado |
| `apps.ipod.status.appleMusicGeniusPlaying` | Genius Mix | Mix Genius | Seleção Genius |
| `apps.tv.status.next` | NEXT | PRÓXIMO | SEGUINTE |
| `apps.tv.status.time` | TIME | HORA | DURAÇÃO |
| `apps.chats.status.listening` | Listening | Ouvindo | Escuta |
| `apps.chats.status.thinking` | Thinking | Pensando | Processando |
| `apps.chats.toolCalls.cursorCloudAgent.stream.thinking` | Thinking | Pensando | Processando |

### A7. Negative-findings phrasing (Apple passive order)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.admin.profile.noMessages` | No messages found | Nenhuma mensagem encontrada | Não foi encontrada nenhuma mensagem |
| `apps.chats.toolCalls.noItemsFound` | No items found | Nenhum item encontrado | Não foi encontrado nenhum item |
| `apps.terminal.output.noItemsFound` | No items found | Nenhum item encontrado | Não foi encontrado nenhum item |
| `apps.dashboard.dictionary.noDefinition` | No definition found. | Nenhuma definição encontrada. | Definição não encontrada. |

### A8. Desktop / wallpaper / display

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.control-panels.desktopAndScreenSaver` | Desktop & Screen Saver | Área de Trabalho e Protetor de Tela | Mesa e Protetor de Tela |
| `spotlight.settings.wallpaper` | Wallpaper | Papel de parede | Imagem de Fundo |
| `common.desktop.setWallpaper` | Set Wallpaper… | Definir Papel de Parede… | Definir… |
| `apps.dashboard.widgets.stickyNote` | Sticky Note | Nota Autoadesiva | Nota Adesiva |
| `apps.stickies.menu.about` | About Stickies | Sobre as Notas Autoadesivas | Sobre Anotações |
| `apps.stickies.menu.help` | Stickies Help | Ajuda das Notas Autoadesivas | Ajuda do Anotações |

### A9. Weather (Apple BR meteorology terms)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.dashboard.weather.conditions.drizzle` | Drizzle | Chuvisco | Garoa |
| `apps.dashboard.weather.conditions.fog` | Fog | Nevoeiro | Neblina |
| `apps.dashboard.weather.conditions.clear` | Clear | Limpo | Limpar (90.6%) |

### A10. Maps / places

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.maps.places.title` | Places | Locais | Lugares |
| `apps.maps.places.recents` | Recent Places | Locais Recentes | Lugares Recentes |
| `apps.maps.poiCategory.postOffice` | Post Office | Correios | Agência de Correios |

### A11. Calculator / speech keys

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.calculator.angle.rad` | Radians | Radians | Radianos |
| `apps.calculator.angle.degShort` | Deg | Graus | Grau |
| `apps.calculator.menu.conversion` | Convert | Conversão | Converter |
| `apps.calculator.menu.scientific` | Scientific | Científico | Científica |
| `apps.calculator.speech.keys.ln` | natural log | logaritmo natural | log natural |
| `apps.calculator.speech.keys.memoryClear` | memory clear | limpar memória | limpeza de memória |
| `apps.ipod.musicQuiz.scoreShort` | Score | Pontuação | Entalhe |

### A12. Calendar views (Apple: **Visualização** not **Vista**)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.calendar.menu.dayView` | Day View | Vista Diária | Visualização Diária |
| `apps.calendar.menu.weekView` | Week View | Vista Semanal | Visualização Semanal |
| `apps.calendar.menu.monthView` | Month View | Vista Mensal | Visualização Mensal |
| `apps.calendar.event.allDay` | All Day | O dia todo | Dia Inteiro |
| `apps.calendar.views.allDay` | all-day | o dia todo | dia inteiro |
| `apps.calendar.event.startTime` | Start Time | Hora Início | Início |
| `apps.calendar.tray.due` | due | vencimento | limite |

### A13. About / Help product-name patterns (Apple: **Sobre o App X**)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.books.menu.aboutBooks` | About Books | Sobre o Books | Sobre o Livros |
| `apps.books.menu.booksHelp` | Books Help | Ajuda do Books | Ajuda do Livros |
| `apps.contacts.menu.about` | About Contacts | Sobre Contatos | Sobre o Contatos |
| `apps.contacts.menu.help` | Contacts Help | Ajuda de Contatos | Ajuda do Contatos |
| `apps.textedit.menu.aboutTextEdit` | About TextEdit | Sobre o TextEdit | Sobre o Editor de Texto |
| `apps.textedit.menu.texteditHelp` | TextEdit Help | Ajuda do TextEdit | Ajuda do Editor de Texto |
| `apps.tv.menu.about` | About TV | Sobre a TV | Sobre o App TV |
| `apps.tv.menu.tvHelp` | TV Help | Ajuda da TV | Ajuda do App TV |
| `apps.videos.menu.aboutVideos` | About Videos | Sobre Vídeos | Sobre o App Vídeos |
| `apps.videos.menu.videosHelp` | Videos Help | Ajuda de Vídeos | Ajuda do App Vídeos |
| `apps.photo-booth.menu.aboutPhotoBooth` | About Photo Booth | Sobre a Cabine de Fotos | Sobre o Photo Booth |
| `apps.photo-booth.menu.photoBoothHelp` | Photo Booth Help | Ajuda da Cabine de Fotos | Ajuda do Photo Booth |
| `apps.control-panels.menu.aboutControlPanelsForMacosX` | About System Preferences | Sobre Preferências do Sistema | Sobre as Preferências do Sistema |
| `apps.control-panels.menu.controlPanelsHelpForMacosX` | System Preferences Help | Ajuda Preferências do Sistema | Ajuda das Preferências do Sistema |

### A14. View modes / books shelf

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.books.shelf.gridView` | Grid View | Visualização em grade | Visualização por Grade |
| `apps.books.shelf.listView` | List View | Visualização em lista | Visualização por Lista |
| `apps.ipod.menu.view` | View | Exibir | Visualizar (89.2%) |

### A15. Games / media / effects (untranslated English in pt)

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.ipod.brickGame.title` | Brick | Brick | Tijolo |
| `apps.ipod.menuItems.brickGame` | Brick | Brick | Tijolo |
| `apps.ipod.brickGame.gameOver` | Game Over | Fim de Jogo | Jogo Finalizado |
| `apps.ipod.brickGame.gameOverTitle` | Game Over | Fim de Jogo | Jogo Finalizado |
| `apps.karaoke.name` | Karaoke | Karaoke | Karaokê |
| `apps.dashboard.ipod.modeKaraoke` | Karaoke | Karaoke | Karaokê |
| `apps.control-panels.screenSaverOptions.matrix.name` | Matrix | Matrix | Matriz |
| `apps.control-panels.terminalIeAmbientSynth` | Synth | Synth | Sintetizador |
| `apps.synth.effectsParams.chorus` | Chorus | Chorus | Coral |
| `apps.synth.effectsParams.delay` | Delay | Delay | Atraso |
| `apps.synth.effectsParams.reverb` | Reverb | Reverb | Reverberação |
| `apps.paint.menu.filterDither` | Dither | Dither | Pontilhado |
| `apps.photo-booth.effects.neon` | Neon | Neon | Néon |
| `debug.toggleLabel` | Debug | Debug | Depurar |
| `settings.language.english` | English | English | Inglês (95.5%) |

### A16. Remaining high-confidence singles

| Key | EN | PT | Apple |
|-----|----|----|-------|
| `apps.admin.cursorAgents.startAgent` | Run | Execução | Executar (80.8%) |
| `apps.admin.server.notConfigured` | Not configured | Não configurado | Não configurada |
| `apps.chats.status.editing` | editing… | editando... | edição… |
| `apps.chats.tokenStatus.justNow` | just now | agora mesmo | há pouco |
| `apps.control-panels.autoSync.justNow` | just now | agora | há pouco |
| `apps.control-panels.autoSync.fetching` | Fetching | Buscando | Obtendo |
| `apps.control-panels.cloudSync.backingUp` | Backing up… | Fazendo backup… | Fazendo o Backup… |
| `apps.control-panels.cloudSync.progress.compressing` | Compressing… | Compactando… | Comprimindo… |
| `apps.control-panels.cloudSync.progress.decompressing` | Decompressing… | Descompactando… | Descomprimindo… |
| `apps.control-panels.accountsTabs.debug` | Debug | Depuração | Depurar |
| `apps.control-panels.debugMode` | Debug Mode | Modo Depuração | Modo de Depuração |
| `apps.control-panels.email.link` | Link | Vincular | Link (94.4%) |
| `apps.control-panels.patterns` | Patterns | Padrões | Padronagens |
| `apps.contacts.groups.imported` | Imported | Importados | Importado |
| `apps.finder.defaultNames.copy` | copy | cópia | copiar |
| `apps.internet-explorer.enterUrl` | Enter URL | Inserir URL | Digite URL |
| `apps.internet-explorer.fetch` | Fetch | Buscar | Obter |
| `apps.ipod.dialogs.appleMusicSearchPlaceholder` | Search Apple Music… | Buscar no Apple Music... | Busque no Apple Music… |
| `apps.ipod.menu.multi` | Multi | Múltiplo | Multi |
| `apps.ipod.menuItems.recentlyAdded` | Recently Added | Adicionadas Recentemente | Adições Recentes (91.7%) |
| `apps.karaoke.liveListen.hostLabel` | Host | Anfitrião | Host (91.7%) |
| `apps.karaoke.liveListen.playbackBadge` | Play | Repro | Reproduzir (90.3%) |
| `apps.minesweeper.lcd.left` | Left | Restantes | Esquerda (86.3%) |
| `apps.paint.menu.filterCategoryRetro` | Retro | Retrô | Retro |
| `apps.paint.menu.filterPixelate` | Pixelate | Pixelizar | Pixelar |
| `apps.pc.menu.aspectRatio` | Aspect Ratio | Proporção da Tela | Proporção |
| `apps.photo-booth.effects.bulge` | Bulge | Boja | Saliência |
| `apps.photo-booth.effects.squeeze` | Squeeze | Comprimir | Apertado |
| `apps.photo-booth.effects.twirl` | Twirl | Rodopiar | Giro |
| `apps.synth.waveforms.sawtooth` | Sawtooth | Dente de Serra | Serrilhada |
| `apps.synth.waveforms.triangle` | Triangle | Triangular | Triângulo |
| `apps.chats.toolCalls.infiniteMac.clicking` | Clicking… | Clicando… | Clicar… |
| `common.dock.turnHidingOn` | Turn Hiding On | Ativar ocultação automática | Ativar Ocultação |
| `common.dock.turnHidingOff` | Turn Hiding Off | Desativar ocultação automática | Desativar Ocultação |
| `common.htmlPreview.full` | Full | Completo | Completa |
| `common.keys.escape` | Escape | Escapar | Esc (90%) |
| `debug.fix` | Fix | Corrigir | Reparar |

---

## B. High-confidence casing-only mismatches (15)

Apple title-case vs pt sentence-case:

| Key | PT | Apple |
|-----|----|-------|
| `common.dock.turnMagnificationOn` | Ativar ampliação | Ativar Ampliação |
| `common.dock.turnMagnificationOff` | Desativar ampliação | Desativar Ampliação |
| `common.appleMenu.noRecentDocuments` | Nenhum documento recente | Nenhum Documento Recente |
| `common.auth.recovery.title` | Redefinir senha | Redefinir Senha |
| `common.auth.recovery.newPassword` | Nova senha | Nova Senha |
| `common.auth.recovery.submit` | Redefinir senha | Redefinir Senha |
| `spotlight.topHits` | Mais relevantes | Mais Relevantes |
| `apps.internet-explorer.olderVersion` | Versão mais antiga | Versão Mais Antiga |
| `apps.textedit.untitled` | Sem título | Sem Título |
| `apps.ipod.dialogs.noUpdates` | Sem Atualizações | Sem atualizações |
| `apps.ipod.menuItems.unknownAlbum` | Álbum desconhecido | Álbum Desconhecido |
| `apps.terminal.output.untitled` | Sem título | Sem Título |
| `apps.control-panels.currentTime` | Hora atual | Hora Atual |
| `apps.control-panels.wallpaperCategories.black_and_white` | Preto e branco | Preto e Branco |
| `apps.calendar.tray.eventDetails` | Detalhes do evento | Detalhes do Evento |
| `apps.calendar.tray.newEventTitle` | Novo evento | Novo Evento |
| `apps.contacts.badges.mine` | Meu cartão | Meu Cartão |
| `apps.contacts.cardLabels.url` | URL | url |
| `apps.admin.user.admin` | admin | Admin |
| `apps.admin.tableHeaders.username` | Nome de Usuário | Nome de usuário |
| `apps.maps.poiCategory.atm` | Caixa Eletrônico | Caixa eletrônico |

*(21 entries — some overlap with collision list where casing is the only delta.)*

---

## C. High-confidence punctuation defects (35 in glossary-matched set; ~120 catalog-wide)

Apple macOS BR uses Unicode ellipsis **`…`**, not ASCII `...`.

**Glossary-matched keys (35):**  
`common.loading.default`, `common.dialog.adding`, `common.auth.changePassword.saving`, `common.auth.recovery.sending`, `common.menu.shareApp`, `common.startMenu.run`, `apps.finder.messages.loading`, `apps.finder.menu.rename`, `apps.admin.redis.loading`, `apps.applet-viewer.dialogs.loading`, `apps.applet-viewer.menu.createAccount`, `apps.applet-viewer.menu.exportAs`, `apps.chats.dialogs.creating`, `apps.chats.menu.createAccount`, `apps.chats.tokenStatus.refreshing`, `apps.control-panels.recoveryEmail.{removing,saving,verifying}`, `apps.control-panels.telegram.{disconnecting,preparing,savingInstructions}`, `apps.dashboard.translation.inputPlaceholder`, `apps.dashboard.widgets.addWidget`, `apps.internet-explorer.menu.clearHistory`, `apps.ipod.menu.{addToLibrary,exportLibrary,shareApp,shareSong}`, `apps.karaoke.menu.shareApp`, `apps.textedit.menu.exportAs`, `apps.tv.create.creating`, `apps.videos.menu.{addToLibrary,resetLibrary,shareVideo}`.

**Additional non-glossary-matched (~85):** boot/restore strings under `common.system.*`, `common.loading.opening*`, `apps.soundboard.menu.importSoundboards`, etc.

**Inverted case:** `apps.control-panels.cloudSync.progress.finishing` — pt uses `…` where Apple dominant is `...` (minority variant).

---

## D. Context collisions (<80% dominant, 89 keys)

These English bases have **multiple Apple translations** with no clear winner. PT often picks a **valid documented alternate** (marked ✓).

| Conf | Key | EN | PT | Apple dominant | Notes |
|------|-----|----|----|----------------|-------|
| 79.7% | `common.dialog.done`, `apps.contacts.buttons.done` | Done | Concluído | OK | ✓ pt is Apple alt |
| 77.8% | `apps.chats.toolCalls.ipodPlaying` | Playing | A reproduzir | Reproduzindo | EU progressive + collision |
| 77.8% | `apps.paint.menu.filterGrayscale` | Grayscale | Escala de Cinza | Tons de Cinza | ✓ |
| 76.9% | `apps.admin.tableHeaders.username` | Username | Nome de Usuário | Nome de usuário | casing |
| 75% | `apps.internet-explorer.latin`, `.menu.latin` | Latin | Latim | Latino | ✓ |
| 73.8% | `apps.control-panels.timezoneAutomatic`, `apps.ipod.translationLanguages.auto` | Auto | Auto | Automático | ✓ intentional shorthand |
| 72.7% | `apps.books.theme.dark`, `apps.control-panels.darkModeDark`, `debug.live.darkMode` | Dark | Escuro | Escura | gender collision |
| 72.7% | `apps.contacts.fields.firstName` | First Name | Primeiro Nome | Nome | ✓ |
| 72.7% | `apps.applet-viewer.sections.featured` | Featured | Destaques | Em Destaque | ✓ |
| 66.7% | `apps.chats.status.loginRequired` (+2) | Sign In Required | Login necessário | Exige Início de Sessão | anglicism vs Apple |
| 66.7% | `apps.internet-explorer.menu.alien` | Alien | Alienígena | Extraterrestre | ✓ |
| 64.7% | `apps.ipod.menu.addToFavorites` (+2) | Add to Favorites | Adicionar aos Favoritos | Adicionar a Favoritos | preposition |
| 60% | `common.keys.enter`, `apps.ipod.keys.enter` | Enter | Entrar | Introduzir | keyboard context |
| 57.1% | `apps.admin.offline.title`, `debug.live.offline` | Offline | Offline | Desconectado | ✓ kept English |
| 53.3% | `apps.ipod.menuItems.one` | One | Uma | Um | gender |
| 50% | `apps.admin.auditLog.retry` (+6 retry keys) | Retry | Tentar novamente | Repetir | ✓ both common in Apple |
| 50% | `apps.chats.status.recording` | Recording… | Gravando... | Gravando… | punct + 50/50 Gravando/Gravação |
| 43.9% | `apps.internet-explorer.off`, `apps.ipod.menuItems.off`, `common.aboutThisMac.virtualMemoryOff` | Off | Desativado/Desligado | Desativar | toggle label collision |
| 26.9% | `apps.books.theme.light`, `apps.control-panels.darkModeLight`, `debug.live.lightMode` | Light | Claro | Clara | highly ambiguous |

**Full collision set:** 89 keys total (all enumerated in analysis output above through `debug.live.lightMode`).

**19 high-confidence mismatches where pt matches a non-dominant Apple alt** (acceptable context picks): e.g. `Próximo` vs `Seguinte` for Next, `Painel` vs `Dashboard`, `Ver` vs `Visualizar`, `Esc` vs `Escape`, `Download` vs `Baixar`.

---

## E. Plural defects (4)

pt-BR CLDR uses `_one` / `_other` only. Four obsolete `_many` keys exist in pt but not en:

| Key | PT value |
|-----|----------|
| `apps.admin.statusBar.auditLogCount_many` | `{{count}} entradas` |
| `apps.admin.statusBar.redisKeysCount_many` | `{{count}} chaves` |
| `apps.ipod.menuItems.playlistTrackCount_many` | `{{count}} músicas` |
| `apps.tv.toasts.importSuccess_many` | `Importados {{count}} canais ({{skipped}} ignorados)` |

No missing `_one`/`_other` forms detected.

---

## F. Placeholders

**0 issues.** All `{{…}}` placeholders match English source keys (including optional `plural` / `newPlural`).

---

## G. Untranslated English (174 identical strings)

**116** are intentional product/brand tokens (OS names, `Cursor`, `Apple Music ✓`, theme names, etc.).

**58 review-worthy** (should often be localized or are mixed-language UI):

| Key | Value |
|-----|-------|
| `settings.language.english` | English → Apple glossary: **Inglês** |
| `settings.language.portuguese` | Português (Brasil) — acceptable |
| `apps.finder.statusBar.item` | item |
| `apps.finder.window.macintoshHd` | Macintosh HD — Apple keeps as-is |
| `apps.calculator.speech.keys.backspace` | backspace |
| `apps.admin.server.websocket` | WebSocket (Pusher) |
| `apps.control-panels.min` | min |
| `debug.live.fpsUnit` | fps |
| `apps.ipod.brickGame.pts` | pts |
| `apps.synth.menu.presets` | Presets → collision dominant **Pré-Ajustes** |
| `apps.chats.toolCalls.cursorCloudAgent.stream.userPrompt` | Prompt |
| … (+46 more technical tokens) |

---

## H. Priority summary

| Priority | Issue class | Count | Action |
|----------|-------------|------:|--------|
| P0 | PT-PT lexicon (`utilizador`, `ecrã`, `ficheiro`, `palavra-passe`, `guardar`, `descarregar`, periphrastic `a + infinitive`) | ~40+ strings | Replace with Apple BR register |
| P0 | Search UI (`Pesquisar`/`Procurar`/`Verificar Atualizações`) vs Apple `Buscar`/`Buscando` | 32+ | Systematic terminology pass |
| P1 | Delete (`Excluir`) vs Apple `Apagar` | 7+ | Align delete actions |
| P1 | ASCII `...` → `…` | ~120 | Mechanical fix |
| P1 | Settings (`Definições`) vs Apple `Ajustes` | 7 | Context-sensitive |
| P2 | High-conf Apple single-word labels (150 items) | 150 | Case-by-case; many are ryOS-specific context |
| P2 | Collisions (89) | 89 | Mostly acceptable alternates |
| P3 | Extra `_many` plural keys | 4 | Remove |
| P3 | Casing-only (21) | 21 | Match Apple title case |

---

## Evidence samples (glossary XML)

AppleGlot entries follow this structure in `.lg` files:

```xml
<TranslationSet>
  <base>Search</base>
  <tran>Buscar</tran>
</TranslationSet>
```

Dominant counts for **Search** in Brazilian glossary: `Buscar` (majority), `Busca`, `Buscar em` — explaining the systematic `Pesquisar` vs `Buscar` findings.

Curated term check (passes):

```167:188:scripts/apple-ui-terminology.ts
export function getExpectedAppleUiTerm(
  englishValue: string,
  locale: TranslationLocale,
  key: string
): string | null {
  const contextual = contextualTerminology[key]?.[locale];
  if (contextual !== undefined && contextualEnglish[key] === englishValue) {
    return contextual;
  }
  // ...
  return `${translations[locale]}${suffix}`;
}
```

---

**Bottom line:** The 114-term curated gate is clean, but the full 3,754-key catalog has **1,357 Apple glossary hits** with **308 deviations** (200 high-confidence + 89 collisions, minus overlap). The strongest systemic gaps are **PT-PT register**, **Search = Buscar**, **Delete = Apagar**, and **ellipsis punctuation** — not missing keys or placeholder breakage. I did not edit any files (Ask mode). Switch to Agent mode if you want automated fixes or an expanded curated term list in `apple-ui-terminology-terms.json`.

# Japanese locale audit vs AppleGlot macOS glossary

Read-only audit of `src/lib/locales/ja/translation.json` against `src/lib/locales/en/translation.json` and the official glossary at `/Users/ryo/Downloads/Glossaries/Japanese.dmg` (mounted at `/Volumes/Japanese`).

**Glossary integrity:** SHA256 `8af95f25ed1cd1fdf22acff9e9e703ba9879d29161403d0a04fe5b314c6b9f1d` — matches `scripts/apple-ui-terminology-data.ts`.

**Parsing:** 680 `.lg` files → 253,645 `TranslationSet` entries → 122,206 unique English bases. Dominant translation per base uses plurality voting (same method as `scripts/extract-apple-terminology.py`); high-confidence = dominant share ≥ 80%.

---

## Summary metrics

| Metric | Count |
|--------|------:|
| Total translation keys (en = ja) | 3,754 |
| Built-in curated Apple-term audit (`getExpectedAppleUiTerm`) | **0 issues** |
| Keys whose English value is an exact glossary base | 1,346 |
| → Exact match to dominant glossary term | 651 |
| → High-confidence mismatch (≥ 80%) | **173** |
| → Ambiguous mismatch (< 80% dominant) | 522 |
| No glossary base (ryOS-specific / compound strings) | 2,408 |
| `[TODO]` markers | 0 |
| CLDR plural form gaps (ja) | 0 |
| Placeholder mismatches | **4** |
| Strings identical to English (Latin) | 122 |
| Heuristic “English leak” hits | 25 |
| JA strings using ASCII `...` (EN uses `…`) | 128 |
| `{{count}}` + space before counter | 29 |
| `{{count}}` + no space before counter | 72 |
| `ウィンドウ` vs `ウインドウ` in JA file | 14 vs 4 |

---

## Layer 1 — Curated Apple UI terminology (repo gate)

The project’s 113-term curated map (`scripts/apple-ui-terminology-terms.json` + contextual overrides in `scripts/apple-ui-terminology.ts`) covers **241 keys**. All 241 match via `getExpectedAppleUiTerm("ja", key)` — consistent with `tests/test-translation-audit.test.ts` passing.

Examples already aligned with glossary:

| English | JA (current) | Apple dominant |
|---------|-------------|----------------|
| Settings | 設定 | 設定 |
| Trash | ゴミ箱 | ゴミ箱 |
| Sign In | サインイン | サインイン |
| Cancel | キャンセル | キャンセル |
| New Window | 新規ウインドウ | 新規ウインドウ (`WebBrowser.lg`) |

Contextual overrides correctly kept (e.g. `apps.admin.server.ok` → `OK`, `apps.dashboard.calendar.showColors` → `色を表示`).

---

## Layer 2 — Full-catalog glossary scan

Of 173 high-confidence mismatches, manual reclassification:

| Class | Count | Actionability |
|-------|------:|---------------|
| **True nomenclature** | 66 | Apple UI wording worth aligning |
| **Style / punctuation only** | 28 | `…` vs `...`, spacing, quote glyphs |
| **Context collisions** | 79 | Glossary base matches wrong domain — **do not blindly adopt** |

Below: all 173 with evidence. Ambiguous 522 omitted (dominant term unreliable; 429 JA strings match a non-dominant glossary alternative).

---

## High-confidence true nomenclature (66)

These are cases where the English string’s dominant Apple translation is a genuine macOS UI label and ryOS’s JA diverges meaningfully (not just ellipsis).

### Long-vowel / ユーザ convention

Apple consistently uses shortened **ユーザ** (not ユーザー) in system UI.

| Key | EN | JA (current) | Apple dominant | Glossary evidence |
|-----|-----|-------------|----------------|-------------------|
| `apps.admin.profile.delete` | Delete User | ユーザーを削除 | ユーザを削除 | dominant 100% |
| `apps.admin.sidebar.users` | Users | ユーザー | ユーザ | dominant 100% |
| `apps.admin.tableHeaders.username` | Username | ユーザー名 | **ユーザ名** | `ShortcutsUI_iosmac.lg`: `Username` → `ユーザ名` |
| `common.auth.username` | Username | ユーザー名 | ユーザ名 | same |

### Auth / account phrasing

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.admin.server.notConfigured` | Not configured | 未設定 | 構成されていません |
| `apps.ipod.menuItems.signedIn` | Signed In | サインイン済み | サインインしました |
| `apps.karaoke.liveListen.linkCopied` | Link copied | リンクをコピーしました | リンクがコピーされました |
| `common.dialog.share.linkCopied` | Link copied | リンクをコピーしました | リンクがコピーされました |

*(Note: `Sign In Required` → `サインインが必要です` appears in `iBooks.lg`; ryOS uses ログイン in several chat/applet keys — classified as context collision below.)*

### Finder / file / dialog patterns

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.finder.statusBar.available` | available | 利用可能 | 使用可能 |
| `apps.contacts.menu.newContact` | New Contact | 新しい連絡先 | 新規連絡先 |
| `apps.contacts.groups.imported` | Imported | インポート済み | 読み込み済み |
| `apps.contacts.picturePicker.chooseCustom` | Choose Image… | 画像を選択… | イメージを選択… |
| `common.desktop.setWallpaper` | Set Wallpaper… | 壁紙を設定… | 壁紙に設定… |
| `apps.finder.contextMenu.putBack` / `apps.finder.menu.putBack` | Put Back | 元に戻す | 戻す |
| `common.dialog.discardChanges` + paint/textedit variants | Discard Changes | 変更を破棄 | 変更内容を破棄 |

### Menu / format / typography (TextEdit, Paint, Terminal)

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.textedit.menu.format` | Format | 書式 | フォーマット |
| `apps.textedit.menu.underline` / `apps.textedit.underline` | Underline | 下線 | アンダーライン |
| `apps.textedit.menu.texteditHelp` | TextEdit Help | テキストエディット**の**ヘルプ | テキストエディットヘルプ |
| `apps.chats.menu.decreaseFontSize` / `increaseFontSize` | Decrease/Increase Font Size | フォントサイズを小さく/大きく | フォントを小さく/大きくする |
| `apps.terminal.menu.decreaseFontSize` / `increaseFontSize` | (same) | (same) | (same) |

### Paint filters (Apple Photo/Image terminology)

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.paint.menu.filters` | Filters | フィルター | フィルタ |
| `apps.paint.menu.filterBlur` / `filterCategoryBlur` | Blur | ぼかし | ブラー |
| `apps.paint.menu.filterGaussianBlur` | Gaussian Blur | ガウスぼかし | ブラー - ガウス |
| `apps.paint.menu.filterGrayscale` | Grayscale | グレースケール | グレイスケール |
| `apps.paint.menu.filterSharpen` | Sharpen | シャープ化 | シャープ |
| `apps.paint.menu.filterCategoryArtistic` | Artistic | アート | アーティスティック |
| `apps.paint.toolbar.fillColor` | Fill Color | 塗りつぶし色 | 塗りつぶしのカラー |

### Media / iPod / Videos

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.videos.status.repeat` | REPEAT | リピート | 繰り返し |
| `apps.ipod.dialogs.noUpdates` | No Updates | 更新なし | アップデートなし |
| `apps.ipod.menuItems.noStations` | No Stations | ステーションがありません | ステーションなし |
| `apps.ipod.menu.fontGoldGlow` | Glow | グロウ | グロー |
| `apps.ipod.menu.multi` | Multi | マルチ | 複数 |
| `apps.ipod.menu.pronunciation` | Pronunciation | 発音 | 読み上げかた |

### Calculator units / speech-adjacent

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.calculator.conversion.units.atm` | Atmospheres | 大気圧 | 気圧 |
| `apps.calculator.conversion.units.bar` | Bar | バール | バー |
| `apps.calculator.conversion.units.gal` | Gallons (US) | ガロン（米国） | 米ガロン |
| `apps.calculator.conversion.units.k` | Kelvin | ケルビン | ケルビン（K） |
| `apps.calculator.conversion.swap` | Swap | 入れ替え | 入れ替える |

### Screenshots, errors, misc UI

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `apps.infinite-mac.help.captureScreenshot.title` / `menu.captureScreenshot` / `apps.pc.menu.captureScreenshot` | Capture Screenshot | スクリーンショットを**撮る** | スクリーンショットを**取り込む** |
| `apps.internet-explorer.anErrorOccurred` | An error occurred | エラーが発生しました | エラーが起きました |
| `apps.internet-explorer.olderVersion` | Older Version | 以前のバージョン | 古いバージョン |
| `apps.dashboard.dictionary.noDefinition` | No definition found. | …見つかりません**でした**。 | …見つかりません**。 |
| `apps.dashboard.dictionary.noResults` | No results. | 結果なし。 | 結果がありません。 |
| `apps.dashboard.weather.selectCity` | Choose a city | 都市を選択 | 都市を選択してください |
| `apps.minesweeper.dialogs.newGameTitle` | New Game | 新しいゲーム | 新規ゲーム |
| `apps.calendar.help.createEvents.title` | Create Events | イベントの作成 | イベントを作成 |
| `apps.chats.ariaLabels.leaveConversation` | Leave conversation | 会話を退出 | チャットを退出 |
| `apps.control-panels.screenSaverOptions.matrix.name` | Matrix | マトリックス | マトリクス |
| `apps.synth.oscillator` | Oscillator | オシレーター | オシレータ |
| `apps.soundboard.description` | Play sound effects | 効果音を再生 | サウンドエフェクトを再生 |
| `debug.live.logging` | Logging | ロギング | ログを記録 |
| `apps.books.help.pageTurn.title` | Turn Pages | ページをめくる | ページ移動 |
| `apps.chats.toolCalls.infiniteMac.clicking` | Clicking… | クリック中… | クリック… |
| `apps.terminal.output.noItemsFound` | No items found | 項目が見つかりません | 項目が見つかりませんでした |
| `apps.ipod.dialogs.pleaseTryAgain` | Please try again. | もう一度お試しください。 | やり直してください。 |
| `apps.control-panels.cloudSync.backingUp` | Backing up… | バックアップ中… | バックアップを作成中… |

### Dock quote glyphs

| Key | EN | JA | Apple |
|-----|-----|-----|-------|
| `common.dock.turnMagnificationOff` | Turn Magnification Off | **「**拡大**」**機能を… | **“**拡大**”**機能を… |
| `common.dock.turnMagnificationOn` | Turn Magnification On | (same pattern) | (same) |

---

## High-confidence style / punctuation only (28)

Dominant glossary term differs mainly by ellipsis glyph or minor spacing — not semantic nomenclature.

**ASCII `...` where Apple uses `…` (22 keys):**  
`apps.admin.redis.loading`, `apps.applet-viewer.dialogs.loading`, `apps.applet-viewer.menu.createAccount`, `apps.chats.menu.createAccount`, `apps.chats.status.editing`, `apps.chats.tokenStatus.refreshing`, `apps.control-panels.deleteAccount.deleting`, `apps.control-panels.recoveryEmail.verifying`, `apps.control-panels.telegram.{disconnecting,preparing,savingInstructions}`, `apps.dashboard.{translation.inputPlaceholder,widgets.addWidget}`, `apps.finder.messages.loading`, `apps.internet-explorer.loadingEllipsis`, `apps.ipod.dialogs.appleMusicSearchPlaceholder`, `apps.ipod.menu.{addToLibrary,shareSong}`, `apps.videos.menu.{addToLibrary,resetLibrary,shareVideo}`, `common.auth.changePassword.saving`, `common.dialog.adding`, `common.loading.default`

**Additional style-only (6):**

| Key | JA | Apple | Issue |
|-----|-----|-------|-------|
| `apps.finder.menu.aboutFinder` | `Finder について` | `Finderについて` | extra space |
| `apps.applet-viewer.menu.exportAs` / `apps.textedit.menu.exportAs` | 名前を付けて書き出す... | 書き出す… | ryOS uses Save-As phrasing + ASCII ellipsis |
| `apps.internet-explorer.menu.clearHistory` | 履歴をクリア... | 履歴を消去… | verb + ellipsis |
| `apps.chats.status.editing` | 編集中... | 編集… | progressive vs noun label |

*(128 total JA strings contain `...`; the 22 above are ones where the **exact EN base** also exists in the glossary with a different dominant string.)*

---

## High-confidence context collisions (79)

Glossary base string matches, but the dominant Apple translation belongs to a **different product context**. ryOS’s current JA is often more appropriate.

| Pattern | Keys (sample) | JA (ryOS) | Glossary dominant | Why collision |
|---------|--------------|-----------|-------------------|---------------|
| Chat “Room” vs physical room | `apps.admin.profile.room/rooms`, `apps.chats.sidebar.rooms`, etc. | ルーム | 部屋 | Maps/Home vs Chats |
| AI status | `apps.chats.status.thinking`, `toolCalls.cursorCloudAgent.stream.thinking` | 考え中/思考中 | 解析中 | Siri parsing vs LLM |
| Voice listen | `apps.chats.status.listening` | 聴取中 | 待機中 | Dictation idle state |
| Opened (past) vs date | `apps.chats.toolCalls.opened`, `apps.terminal.output.opened` | 開きました | 開いた日 | Mail “date opened” |
| Server health | `apps.admin.server.unhealthy` | 不健全 | 中程度の汚染 | Environmental sensor |
| Admin memories | `apps.admin.profile.memories` | 思い出 | メモリー | Photos “Memories” feature |
| Applet | `apps.chats.toolCalls.applet`, `common.dialog.share.itemTypes.applet` | アプレット | スクリプトアプリケーション | AppleScript vs ryOS applet |
| Share “by” | `common.dialog.share.by` | による | 並べ替え基準 : | Mail sort header |
| Maps recents | `apps.maps.places.recents` | 最近表示した場所 | 最近使ったフォルダ | Finder folders |
| IE navigation | `apps.internet-explorer.travel` | 移動 | 旅行 | History “Travel” category |
| Books app name | `apps.control-panels.autoSync.books`, menu strings | 本 / Books | ブック | App name vs generic “books” |
| Stickies app | stickies menu/help keys | 付箋 / Stickies | スティッキーズ / メモ | App branding |
| Photo Booth | about/help menus | フォトブース | Photo Booth | Apple keeps English product name |
| Color pickers | `common.colors.*`, purple variants | 青/緑/紫/黄色 | ブルー/グリーン/パープル/イエロー | Native color names vs UI swatch labels |
| Log in vs Sign in | several `loginRequired`, `loggingIn`, `loggingOut` | ログイン/ログアウト | サインイン/サインアウト | Mixed Apple auth vocabulary |
| Calculator speech | `apps.calculator.speech.keys.*` | 割る/マイナス/乱数/log | 除算/減算/ランダム/ログ | VoiceOver math vs spoken operators |
| Game / brand English | `Game Over`, `Cover Flow`, `LIVE`, `Brick`, `Sawtooth`, `Telegram`, `Karaoke` | mixed | Apple keeps or differs | Intentional product/game terms |
| Terms of Service | `apps.control-panels.termsOfService`, `common.aboutThisMac.termsOfService` | 利用規約 | サービス利用条件 | Web-standard 利用規約 is common in JP |
| Put Back | finder putBack keys | 元に戻す | 戻す | Both used in macOS; ryOS choice valid |
| Admin label | `apps.admin.name` | **Admin** (untranslated) | 管理者 | Product surface name vs role |
| Misc | `apps.control-panels.panes.international`, wallpaper categories, photo-booth effects, paint `brush`, etc. | — | — | Domain-specific Apple strings |

Full list of 79 collision keys matches the “CONTEXT COLLISIONS” block from the scan (lines in agent output above).

---

## Apple product names

| Product | Apple glossary tendency | ryOS JA pattern | Finding |
|---------|------------------------|-----------------|---------|
| **Finder** | Untranslated | Untranslated | OK |
| **Apple Music** | Untranslated | Untranslated | OK (intentional English) |
| **Cover Flow** | Untranslated | カバーフロー | Collision — Apple keeps English (`apps.ipod.menu.coverFlow`) |
| **Photo Booth** | Untranslated in About/Help | フォトブース | Collision — Apple: `Photo Boothについて` |
| **Books** | ブック (app) | 本 / Books | Mixed — sync pane uses 本 |
| **Stickies** | スティッキーズ | Stickies / 付箋 | Mixed — help text doesn’t localize app name |
| **TextEdit** | テキストエディット | テキストエディット | OK |
| **Telegram** | Telegram (brand) | テレグラム | Collision — Apple keeps Latin brand |
| **Window** | **ウインドウ** (UI) | **ウィンドウ** (14×) / **ウインドウ** (4×) | Inconsistent; glossary: `Window` → `ウインドウ` in `screencapture.lg`; `apps.applet-viewer.menu.window` uses ウィンドウ |

---

## Counters and plurals

**Plurals:** All required ja CLDR forms present (`_one` / `_other` where English defines them). Built-in `REQUIRED_KEY_TRANSLATIONS` overrides satisfied. **0 plural gaps.**

**Counter spacing:** Inconsistent house style.

- **No space** (71 keys): e.g. `{{count}}曲`, `メッセージ{{count}}件` — matches `REQUIRED_KEY_TRANSLATIONS` pattern (`{{count}}曲`).
- **With space** (29 keys): e.g. `{{count}} 件`, `{{count}} 曲が見つかりました`.

Apple glossary itself varies; recommend picking one convention (no space aligns with existing required overrides).

---

## Placeholders (4 high-confidence issues)

| Key | Missing in JA |
|-----|---------------|
| `apps.ipod.dialogs.addedSongsToTop` | `{{plural}}` |
| `apps.ipod.dialogs.autoUpdatedLibraryAddedSongs` | `{{newPlural}}` |
| `apps.ipod.dialogs.addedNewSongsToTop` | `{{newPlural}}` |
| `apps.ipod.dialogs.andUpdated` | `{{plural}}` |

Built-in audit flags these; they are wiring bugs, not glossary nomenclature.

---

## English leaks

**122 keys identical to English** — mostly intentional: product names (Finder, iPod, Windows presets), tech tokens (HTML, Redis, TTL), language endonyms (Français, Deutsch), TV badges (CH, VID, NET).

**25 heuristic leak hits** — largely overlapping; notable **non-brand** cases:

| Key | EN | JA | Note |
|-----|-----|-----|------|
| `apps.admin.name` | Admin | Admin | Should be 管理者 if following Apple |
| `apps.dashboard.ipod.modeKaraoke` | Karaoke | Karaoke | Glossary: カラオケ |
| `apps.calculator.speech.keys.log` | log | log | Glossary: ログ |
| `apps.control-panels.themeNames.aquaGlass` | Aqua Glass | Aqua Glass | Theme name — may be intentional |

Brand/product strings (Apple Music, Cover Flow, Internet Explorer, Arch Linux, etc.) are correctly left in English or transliterated per Apple practice.

---

## Katakana vs native terminology

| Domain | ryOS (native) | Apple (often katakana in UI) | Keys |
|--------|--------------|------------------------------|------|
| Colors in pickers | 青/緑/紫/黄色 | ブルー/グリーン/パープル/イエロー | `common.colors.*`, dashboard/stickies purple |
| Sticky note | 付箋 | 付せん (Stickies app) | `apps.dashboard.widgets.stickyNote` |
| Image | 画像 | イメージ | `apps.contacts.picturePicker.chooseCustom` |
| Filter blur | ぼかし | ブラー | Paint menus |
| Sound | 効果音 | サウンドエフェクト | `apps.soundboard.description` |

Whether to adopt katakana depends on surface (system chrome vs in-app descriptive copy).

---

## Ambiguous glossary zone (522 keys, not high-confidence)

Dominant term < 80% — often polysemous English (`Action`, `Back`, `Run`, `Key`, `Status`, `Today`, language names, etc.). Of these, **429** JA strings match a non-dominant glossary alternative; **94** match neither dominant nor top alternatives. Treat as **informational only**, not nomenclature defects.

Examples where ryOS is reasonable despite low dominant confidence:

- `common.dialog.about` → JA `について` vs dominant `製品情報`
- `common.startMenu.run` → JA `ファイル名を指定して実行...` vs dominant `ランニング…` (Windows-ism vs unrelated glossary hit)
- `apps.admin.auditLog.action` → JA `アクション` vs dominant `内容` (context override in repo uses different logic)

---

## Recommendations (read-only guidance)

1. **Safe wins:** Fix 4 placeholder gaps; normalize 128 `...` → `…` where EN uses Unicode ellipsis.
2. **Apple alignment (66 nomenclature items):** Prioritize ユーザ/ユーザ名, TextEdit/Paint filter terms, screenshot “取り込む”, and discard-changes “変更内容を破棄”.
3. **Do not auto-fix 79 context collisions** — glossary dominant term is frequently wrong for ryOS semantics.
4. **Product names:** Decide house policy: English for Photo Booth / Cover Flow (Apple) vs current katakana/translation.
5. **Window spelling:** Standardize on **ウインドウ** for macOS UI chrome (14× ウィンドウ today).
6. **Counters:** Standardize on no-space `{{count}}曲` / `{{count}}件` to match `REQUIRED_KEY_TRANSLATIONS`.

No files were modified. Switch to Agent mode if you want automated fixes applied.

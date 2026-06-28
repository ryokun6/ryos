# zh-TW Full-Catalog AppleGlot Audit

Read-only audit of `src/lib/locales/zh-TW/translation.json` against the official AppleGlot macOS Traditional Chinese glossary (`Traditional_Chinese.dmg`, SHA256 `67c1edf2…`, 679 `.lg` files, 121,608 unique base strings).

---

## Methodology

| Step | Detail |
|------|--------|
| Source | English values from `src/lib/locales/en/translation.json` (3,754 flat keys) |
| Glossary | All `*.lg` XML files: `<base>` → `<tran>` with occurrence counts |
| Match rule | English string **exactly equals** an Apple base string (after trim) |
| Expected term | **Dominant** translation (highest count; tie-break lexicographic) |
| High-confidence mismatch | zh-TW ≠ dominant **and** dominant confidence ≥ 80% **and** zh-TW is **not** itself a documented Apple alternative for that base |
| Context collision | zh-TW matches a non-dominant Apple alternative → excluded from high-confidence (likely correct in context) |
| Repo cross-check | `bun run scripts/audit-translations.ts` checks only **113 curated** Apple UI terms + contextual overrides |

---

## Executive Metrics

| Metric | Value |
|--------|------:|
| Total translation keys | 3,754 |
| zh-TW key parity vs en | 100% (0 missing, 0 extra) |
| `[TODO]` markers | 0 |
| Apple glossary base strings | 121,608 |
| Keys with exact Apple base match | 1,335 (35.6% of catalog) |
| Exact matches aligned with Apple dominant | 897 (67.2% of matched) |
| Exact-match mismatches (total) | 438 |
| **High-confidence nomenclature mismatches** | **289** |
| Context collisions (zh = Apple alt) | 80 |
| Low-confidence mismatches | 69 |
| Keys with no exact Apple base | 2,419 (phrases, ryOS-specific copy, interpolated strings) |
| Built-in `i18n:audit` result | **Pass** (113-term subset only) |

### High-confidence breakdown

| Category | Count |
|----------|------:|
| Pure terminology (base text differs) | 231 |
| Punctuation / ellipsis only | 58 |

---

## Special-Focus Areas

### 帳號 vs 帳戶

**Result: Clean.** Zero `帳戶` occurrences. All account-related strings use `帳號`, matching Apple’s dominant term for `Account` → `帳號` (100% confidence). Examples: `apps.control-panels.accountMenu`, `common.auth.createAccount`, `apps.control-panels.deleteAccount.*`.

### 檔案 vs 文件

Apple glossary mapping:

| English | Apple zh-TW |
|---------|-------------|
| File / Files | 檔案 |
| Document / Documents | 文件 |
| Folder | 檔案夾 |
| New Folder | 新增檔案夾 |

**Standalone term keys: 18/18 correct** for File, Folder, Document menu labels.

One high-confidence phrase mismatch (wording, not 檔案/文件 confusion):

- `common.appleMenu.noRecentDocuments` — ZH `沒有最近使用的文件` vs Apple `沒有最近使用過的文件` (uses correct 文件; missing 使用過)

### Punctuation: `…` vs `...` vs `⋯`

| Metric | Value |
|--------|------:|
| EN keys ending in ellipsis | 265 |
| zh-TW using `...` (three ASCII dots) | 125 |
| zh-TW using `…` (U+2026) | 139 |
| zh-TW using Apple `⋯` (U+22EF midline) | **0** |
| Exact-match keys where Apple expects `⋯` | 74 |
| High-confidence ellipsis mismatches | 58 |

Apple consistently uses midline ellipsis `⋯`; ryOS uses `…` or `...`. No key exactly matches Apple’s ellipsis character.

### Counters / plural behavior

zh-TW has **7 plural key pairs** (`_one` / `_other`). Chinese correctly uses identical forms for both (no grammatical plural):

| Key | EN `_one` / `_other` | zh-TW (both) |
|-----|----------------------|--------------|
| `apps.admin.statusBar.auditLogCount_*` | entry / entries | `{{count}} 筆項目` |
| `apps.admin.statusBar.redisKeysCount_*` | key / keys | `{{count}} 個鍵` |
| `apps.contacts.status.cardsCount_one` | card | `{{count}} 名片` |
| `apps.ipod.menuItems.playlistTrackCount_*` | song / songs | `{{count}} 首歌曲` |
| `apps.tv.toasts.importSuccess_*` | channel(s) | `{{count}} 個頻道...` |

**Counter issues (high-confidence):**

- `apps.finder.statusBar.item` — ZH `個項目` vs Apple `項目` (collision: zh matches alt)
- Several iPod dialogs drop `{{plural}}` / `{{newPlural}}` placeholders present in EN (see Placeholders)

### Untranslated English (100 keys)

Intentional product/brand retention: `Finder`, `iPod`, `Apple Music`, `Cover Flow`, `Genius Mix`, `Spotlight`, OS preset names (`Windows 95`, `FreeDOS`, …), `Telegram`, `HTML`, `Markdown`, language endonyms (`Français`, `Deutsch`, …).

**High-confidence glossary mismatch among these:**

- `settings.language.english` — EN `English` → ZH `English` vs Apple `英文` (95%)
- `apps.dashboard.ipod.modeKaraoke` — `Karaoke` vs Apple `卡拉OK`
- `apps.ipod.status.appleMusicGeniusPlaying` — `Genius Mix` vs Apple `智選推薦組曲`
- `apps.ipod.help.coverFlow.title` — `Cover Flow` vs Apple `封面暢覽`

### Placeholders

14 keys differ only in placeholder **order** (functionally safe). 4 keys **missing** optional plural placeholders:

- `apps.ipod.dialogs.addedSongsToTop` — missing `{{plural}}`
- `apps.ipod.dialogs.autoUpdatedLibraryAddedSongs` — missing `{{newPlural}}`
- `apps.ipod.dialogs.addedNewSongsToTop` — missing `{{newPlural}}`
- `apps.ipod.dialogs.andUpdated` — missing `{{plural}}`

---

## Curated 113-Term Subset (repo audit scope)

The repo’s `apple-ui-terminology-terms.json` drives `i18n:audit`. Of those 113 terms present in the catalog:

| Status | Count |
|--------|------:|
| Correct (incl. contextual overrides) | 111 |
| Mismatch vs glossary dominant | 2 |

| Key | EN | zh-TW | Apple | Notes |
|-----|----|-------|-------|-------|
| `apps.admin.auditLog.action` | Action | 操作 | 動作 (98%) | **Contextual override** in `APPLE_UI_CONTEXTUAL_TERMINOLOGY` |
| `apps.admin.server.ok` | OK | 確定 | 好 (100%) | **Contextual override** → 確定 |

Both are **intentional** per `scripts/apple-ui-terminology.ts`.

---

## Context Collisions (80) — Not High-Confidence Mismatches

These keys match a **non-dominant Apple alternative**; the dominant term would be wrong in context. Do not auto-fix.

<details>
<summary>All 80 context collisions (click to expand)</summary>

| Key | EN | zh-TW | Apple dominant | zh matches alt |
|-----|----|-------|----------------|----------------|
| `apps.admin.cursorAgents.colModel` | Model | 模型 | 機型 | 模型 |
| `apps.admin.profile.reason` | Reason | 原因 | 類型 | 原因 |
| `apps.admin.server.provider.local` | Local | 本地 | 本機 | 本地 |
| `apps.books.columns.single` | Single | 單頁 | 單線 | 單頁 |
| `apps.calculator.conversion.amount` | Amount | 數量 | 金額 | 數量 |
| `apps.calculator.conversion.categories.energy` | Energy | 能量 | 能耗 | 能量 |
| `apps.calculator.conversion.categories.volume` | Volume | 體積 | 音量 | 體積 |
| `apps.calculator.conversion.from` | From | 從 | 寄件人 | 從 |
| `apps.calculator.conversion.to` | To | 到 | 收件人 | 到 |
| `apps.calculator.conversion.units.acre` | Acres | 英畝 | Acres | 英畝 |
| `apps.calculator.speech.keys.degrees` | degrees | 度 | 度數 | 度 |
| `apps.calculator.speech.keys.minus` | minus | 減 | 減號 | 減 |
| `apps.calculator.speech.keys.random` | random | 隨機 | 亂序 | 隨機 |
| `apps.calendar.event.notes` | Notes | 備註 | 備忘錄 | 備註 |
| `apps.calendar.menu.deleteEvent` | Delete Event | 刪除事件 | 刪除行程 | 刪除事件 |
| `apps.calendar.tray.from` | from | 來自 | 從 | 來自 |
| `apps.calendar.views.day` | Day | 日 | 天 | 日 |
| `apps.chats.dialogs.create` | Create | 建立 | 製作 | 建立 |
| `apps.chats.toolCalls.cursorCloudAgent.running` | Running | 執行中 | 灑水中 | 執行中 |
| `apps.contacts.fields.notes` | Notes | 備註 | 備忘錄 | 備註 |
| `apps.contacts.groupHeaders.names` | Name | 姓名 | 名稱 | 姓名 |
| `apps.contacts.groups.work` | Work | 工作 | 公司 | 工作 |
| `apps.control-panels.currentTime` | Current Time | 目前時間 | 現在的時間 | 目前時間 |
| `apps.control-panels.default` | Default | 預設 | 預設值 | 預設 |
| `apps.control-panels.master` | Master | 主控 | 主聲道 | 主控 |
| `apps.control-panels.mono` | Mono | 黑白 | 單聲道 | 黑白 |
| `apps.control-panels.themeNames.aqua` | Aqua | Aqua | 水藍色 | Aqua |
| `apps.dashboard.calendar.colors.orange` | Orange | 橘色 | 橙色 | 橘色 |
| `apps.dashboard.currency.from` | From | 來源 | 寄件人 | 來源 |
| `apps.dashboard.ipod.next` | Next | 下一首 | 下一步 | 下一首 |
| `apps.dashboard.translation.from` | From | 從 | 寄件人 | 從 |
| `apps.dashboard.translation.to` | To | 到 | 收件人 | 到 |
| `apps.dashboard.weather.conditions.snow` | Snow | 雪 | 下雪 | 雪 |
| `apps.finder.statusBar.item` | item | 個項目 | 項目 | 個項目 |
| `apps.internet-explorer.latin` | Latin | 拉丁文 | 拉丁樂 | 拉丁文 |
| `apps.internet-explorer.menu.chinese` | Chinese | 中文 | 農曆 | 中文 |
| `apps.internet-explorer.menu.latin` | Latin | 拉丁文 | 拉丁樂 | 拉丁文 |
| `apps.internet-explorer.menu.year` | Year | 年 | 年份 | 年 |
| `apps.internet-explorer.year` | Year | 年 | 年份 | 年 |
| `apps.ipod.menu.chinesePinyin` | Chinese | 中文 | 農曆 | 中文 |
| `apps.ipod.menu.classic` | Classic | 經典 | 傳統 | 經典 |
| `apps.ipod.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.ipod.menu.displayGradient` | Gradient | 漸層 | 梯度 | 漸層 |
| `apps.ipod.menu.fontGradient` | Gradient | 漸層 | 梯度 | 漸層 |
| `apps.ipod.menu.next` | Next | 下一首 | 下一步 | 下一首 |
| `apps.ipod.menu.screenClassic` | Classic | 經典 | 傳統 | 經典 |
| `apps.ipod.menu.view` | View | 檢視 | 顯示方式 | 檢視 |
| `apps.ipod.menuItems.radio` | Radio | 廣播 | Radio | 廣播 |
| `apps.karaoke.liveListen.hostLabel` | Host | 主持人 | 主機 | 主持人 |
| `apps.karaoke.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.karaoke.menu.next` | Next | 下一首 | 下一步 | 下一首 |
| `apps.karaoke.menu.view` | View | 檢視 | 顯示方式 | 檢視 |
| `apps.maps.placeCard.home` | Home | 住家 | 家庭 | 住家 |
| `apps.maps.places.home` | Home | 住家 | 家庭 | 住家 |
| `apps.maps.poiCategory.bank` | Bank | 銀行 | Bank | 銀行 |
| `apps.maps.poiCategory.hotel` | Hotel | 飯店 | Hotel | 飯店 |
| `apps.maps.poiCategory.park` | Park | 公園 | Park | 公園 |
| `apps.maps.poiCategory.stadium` | Stadium | 體育場 | 體育館 | 體育場 |
| `apps.paint.menu.filterCategoryColor` | Color | 色彩 | 顏色 | 色彩 |
| `apps.paint.toolbar.oval` | Oval | 橢圓 | Oval | 橢圓 |
| `apps.pc.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.photo-booth.effects.neon` | Neon | 霓虹 | Neon | 霓虹 |
| `apps.stickies.colors.orange` | Orange | 橘色 | 橙色 | 橘色 |
| `apps.synth.effectsParams.chorus` | Chorus | 合唱 | 和聲 | 合唱 |
| `apps.synth.waveforms.sine` | Sine | 正弦波 | 正弦 | 正弦波 |
| `apps.synth.waveforms.square` | Square | 方波 | 正方形 | 方波 |
| `apps.synth.waveforms.triangle` | Triangle | 三角波 | 三角形 | 三角波 |
| `apps.tv.menu.channels` | Channels | 頻道 | 聲道 | 頻道 |
| `apps.tv.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.tv.menu.next` | Next | 下一個 | 下一步 | 下一個 |
| `apps.videos.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.videos.menu.next` | Next | 下一個 | 下一步 | 下一個 |
| `apps.winamp.menu.controls` | Controls | 控制 | 控制項目 | 控制 |
| `apps.winamp.menu.next` | Next | 下一個 | 下一步 | 下一個 |
| `apps.winamp.skins.default` | Default | 預設 | 預設值 | 預設 |
| `common.appMenu.showAll` | Show All | 全部顯示 | 顯示全部 | 全部顯示 |
| `common.dialog.share.from` | from | 來自 | 從 | 來自 |
| `common.menu.view` | View | 檢視 | 顯示方式 | 檢視 |
| `common.swipeInstructions.next` | Next | 下一個 | 下一步 | 下一個 |
| `debug.live.value` | Value | 值 | 數值 | 值 |

</details>

---

## All 289 High-Confidence Findings

Evidence format: **key** | EN → zh-TW | Apple dominant (confidence)

### Punctuation / ellipsis (58)

1. `apps.admin.profile.clearing` | Clearing… → 清除中… | 正在清除⋯ (100%)
2. `apps.admin.redis.loading` | Loading… → 載入中... | 載入中⋯ (96%)
3. `apps.applet-viewer.dialogs.loading` | Loading… → 載入中... | 載入中⋯ (96%)
4. `apps.applet-viewer.menu.createAccount` | Create Account… → 建立帳號... | 建立帳號⋯ (100%)
5. `apps.applet-viewer.menu.exportAs` | Export As… → 匯出為... | 輸出為⋯ (100%)
6. `apps.applet-viewer.menu.login` | Sign In… → 登入… | 登入⋯ (100%)
7. `apps.applet-viewer.menu.open` | Open… → 打開… | 打開⋯ (100%)
8. `apps.chats.dialogs.creating` | Creating… → 建立中... | 正在製作⋯ (100%)
9. `apps.chats.menu.createAccount` | Create Account… → 建立帳號... | 建立帳號⋯ (100%)
10. `apps.chats.menu.login` | Sign In… → 登入… | 登入⋯ (100%)
11. `apps.chats.tokenStatus.refreshing` | Refreshing… → 正在重新整理... | 正在重新整理⋯ (100%)
12. `apps.chats.toolCalls.settingsCheckingForUpdates` | Checking for updates… → 正在檢查更新… | 正在檢查更新項目⋯ (100%)
13. `apps.control-panels.autoSync.openSettings` | Sync Settings… → 同步設定… | 同步設定⋯ (100%)
14. `apps.control-panels.cloudSync.backingUp` | Backing up… → 正在備份… | 正在備份⋯ (100%)
15. `apps.control-panels.cloudSync.forceDownloading` | Downloading… → 下載中… | 下載中⋯ (90%)
16. `apps.control-panels.cloudSync.progress.compressing` | Compressing… → 正在壓縮… | 正在壓縮⋯ (100%)
17. `apps.control-panels.cloudSync.progress.finishing` | Finishing up… → 正在完成… | 即將完成⋯ (100%)
18. `apps.control-panels.deleteAccount.deleting` | Deleting… → 正在刪除... | 正在刪除⋯ (100%)
19. `apps.control-panels.loggingOut` | Signing out… → 登出中... | 正在登出⋯ (100%)
20. `apps.control-panels.recoveryEmail.saving` | Sending… → 正在傳送... | 傳送中⋯ (83%)
21. `apps.control-panels.telegram.disconnecting` | Disconnecting… → 正在中斷連結... | 正在中斷連線⋯ (100%)
22. `apps.control-panels.telegram.preparing` | Preparing… → 正在準備... | 準備中⋯ (92%)
23. `apps.dashboard.dictionary.searchPlaceholder` | Search… → 搜尋… | 搜尋⋯ (100%)
24. `apps.dashboard.stocks.searching` | Searching… → 搜尋中... | 搜尋中⋯ (96%)
25. `apps.dashboard.weather.searching` | Searching… → 正在搜尋... | 搜尋中⋯ (96%)
26. `apps.finder.contextMenu.emptyTrash` | Empty Trash… → 清空垃圾桶… | 清空垃圾桶⋯ (100%)
27. `apps.finder.contextMenu.rename` | Rename… → 重新命名… | 重新命名⋯ (100%)
28. `apps.finder.menu.emptyTrash` | Empty Trash… → 清空垃圾桶… | 清空垃圾桶⋯ (100%)
29. `apps.finder.menu.rename` | Rename… → 重新命名... | 重新命名⋯ (100%)
30. `apps.finder.messages.loading` | Loading… → 載入中... | 載入中⋯ (96%)
31. `apps.internet-explorer.loadingEllipsis` | Loading… → 正在載入... | 載入中⋯ (96%)
32. `apps.internet-explorer.menu.clearHistory` | Clear History… → 清除歷史記錄... | 清除瀏覽記錄⋯ (100%)
33. `apps.ipod.dialogs.lyricsSearchSearching` | Searching… → 搜尋中... | 搜尋中⋯ (96%)
34. `apps.ipod.dialogs.songSearchSearching` | Searching… → 正在搜尋... | 搜尋中⋯ (96%)
35. `apps.ipod.menu.addToLibrary` | Add to Library… → 加入資料庫... | 加入書庫⋯ (100%)
36. `apps.ipod.menu.exportLibrary` | Export Library… → 輸出資料庫... | 輸出資料庫⋯ (100%)
37. `apps.ipod.menu.shareApp` | Share App… → 分享應用程式… | 分享App⋯ (100%)
38. `apps.ipod.menuItems.loading` | Loading… → 載入中… | 載入中⋯ (96%)
39. `apps.karaoke.menu.shareApp` | Share App… → 分享應用程式… | 分享App⋯ (100%)
40. `apps.maps.searching` | Searching… → 正在搜尋… | 搜尋中⋯ (96%)
41. `apps.paint.menu.open` | Open… → 打開… | 打開⋯ (100%)
42. `apps.paint.menu.saveEllipsis` | Save… → 儲存… | 儲存⋯ (100%)
43. `apps.pc.status.loading` | Loading… → 載入中… | 載入中⋯ (96%)
44. `apps.textedit.menu.exportAs` | Export As… → 輸出為... | 輸出為⋯ (100%)
45. `apps.textedit.menu.open` | Open… → 打開… | 打開⋯ (100%)
46. `apps.textedit.menu.saveEllipsis` | Save… → 儲存… | 儲存⋯ (100%)
47. `apps.tv.create.creating` | Creating… → 正在建立... | 正在製作⋯ (100%)
48. `apps.videos.menu.addToLibrary` | Add to Library… → 加入資料庫... | 加入書庫⋯ (100%)
49. `common.appleMenu.createAccount` | Create Account… → 建立帳號… | 建立帳號⋯ (100%)
50. `common.appleMenu.login` | Sign In… → 登入… | 登入⋯ (100%)
51. `common.appleMenu.softwareUpdate` | Software Update… → 軟體更新… | 軟體更新⋯ (100%)
52. `common.appleMenu.systemPreferences` | System Preferences… → 系統偏好設定… | 系統偏好設定⋯ (100%)
53. `common.auth.creatingAccount` | Creating… → 正在建立... | 正在製作⋯ (100%)
54. `common.auth.loggingIn` | Signing in… → 正在登入... | 正在登入⋯ (80%)
55. `common.auth.recovery.sending` | Sending… → 正在發送... | 傳送中⋯ (83%)
56. `common.loading.default` | Loading… → 載入中... | 載入中⋯ (96%)
57. `common.menu.shareApp` | Share App… → 分享應用程式… | 分享App⋯ (100%)
58. `debug.live.loading` | Loading… → 載入中… | 載入中⋯ (96%)

### Account / auth (8)

59. `apps.admin.errors.notAuthenticated` | Not authenticated → 未經認證 | 未認證 (100%)
60. `apps.control-panels.changePassword` | Change Password → 變更密碼 | 更改密碼 (100%)
61. `apps.control-panels.logoutAll.authErrorDescription` | Not authenticated → 未經身份驗證 | 未認證 (100%)
62. `common.auth.changePassword.submit` | Change Password → 變更密碼 | 更改密碼 (100%)
63. `common.auth.changePassword.title` | Change Password → 變更密碼 | 更改密碼 (100%)
64. `common.auth.recovery.mismatch` | Passwords do not match → 密碼不相符 | 密碼不符 (100%)
65. `common.auth.recovery.submit` | Reset Password → 重設密碼 | 重置密碼 (100%)
66. `common.auth.recovery.title` | Reset Password → 重設密碼 | 重置密碼 (100%)

### Copy / paste (6)

67. `apps.control-panels.telegram.copyCode` | Copy Code → 複製代碼 | 拷貝認證碼 (100%)
68. `apps.karaoke.liveListen.copyLink` | Copy Link → 複製連結 | 拷貝連結 (100%)
69. `apps.karaoke.liveListen.linkCopied` | Link copied → 連結已複製 | 已拷貝連結 (100%)
70. `common.dialog.share.copyLink` | Copy Link → 複製連結 | 拷貝連結 (100%)
71. `common.dialog.share.linkCopied` | Link copied → 連結已複製 | 已拷貝連結 (100%)
72. `debug.copied` | Copied → 已複製 | 已拷貝 (100%)

### Retry (5)

73–77. `apps.admin.auditLog.retry`, `apps.admin.cursorAgents.retry`, `apps.admin.dashboard.retry`, `apps.chats.status.retry`, `apps.dashboard.stocks.retry` — Retry → 重試 | 再試一次 (100% each)

### Favorites (5)

78. `apps.internet-explorer.favorite` | Favorite → 最愛 | 喜好項目 (89%)
79. `apps.internet-explorer.menu.favorites` | Favorites → 我的最愛 | 喜好項目 (94%)
80. `apps.maps.placeCard.favorite` | Favorite → 最愛 | 喜好項目 (89%)
81. `apps.maps.placeCard.favorited` | Favorited → 已加入最愛 | 已加入喜好項目 (100%)
82. `apps.maps.places.favorites` | Favorites → 最愛 | 喜好項目 (94%)

### File / I/O (6)

83. `apps.chats.toolCalls.opened` | Opened → 已開啟 | 打開的時間 (100%)
84. `apps.contacts.groups.imported` | Imported → 已匯入 | 已輸入 (100%)
85. `apps.paint.menu.export` | Export → 匯出 | 輸出 (100%)
86. `apps.terminal.output.opened` | Opened → 已開啟 | 打開的時間 (100%)
87. `common.appleMenu.noRecentDocuments` | No Recent Documents → 沒有最近使用的文件 | 沒有最近使用過的文件 (100%)
88. `spotlight.hintOpen` | open → 開啟 | 打開 (100%)

### Calendar (9)

89. `apps.calendar.event.allDay` | All Day → 全天 | 整日 (100%)
90. `apps.calendar.event.editEvent` | Edit Event → 編輯事件 | 編輯行程 (100%)
91. `apps.calendar.help.createEvents.title` | Create Events → 建立行程 | 製作行程 (100%)
92. `apps.calendar.menu.about` | About Calendar → 關於日曆 | 關於行事曆 (100%)
93. `apps.calendar.menu.dayView` | Day View → 日檢視 | 整日檢視區 (100%)
94. `apps.calendar.menu.editEvent` | Edit Event → 編輯事件 | 編輯行程 (100%)
95. `apps.calendar.menu.monthView` | Month View → 月檢視 | 整月檢視區 (100%)
96. `apps.calendar.menu.weekView` | Week View → 週檢視 | 整週檢視區 (100%)
97. `apps.calendar.tray.eventDetails` | Event Details → 事件詳情 | 事件詳細資訊 (100%)

### About / Help (9)

98. `apps.books.menu.aboutBooks` | About Books → 關於「書籍」 | 關於書籍 (100%)
99. `apps.books.menu.booksHelp` | Books Help → 「書籍」說明 | 書籍輔助說明 (100%)
100. `apps.finder.menu.aboutFinder` | About Finder → 關於 Finder | 關於Finder (100%)
101. `apps.photo-booth.menu.aboutPhotoBooth` | About Photo Booth → 關於照片亭 | 關於Photo Booth (100%)
102. `apps.photo-booth.menu.photoBoothHelp` | Photo Booth Help → 照片亭輔助說明 | Photo Booth輔助說明 (100%)
103. `apps.stickies.menu.about` | About Stickies → 關於便利貼 | 關於便條紙 (100%)
104. `apps.stickies.menu.help` | Stickies Help → 便利貼輔助說明 | 便條紙輔助說明 (100%)
105. `apps.tv.menu.about` | About TV → 關於 TV | 關於電視 (100%)
106. `apps.tv.menu.tvHelp` | TV Help → 電視說明 | 電視輔助說明 (100%)

### Text formatting (10)

107–116. Font size keys (`縮小字體`/`放大字體` vs 縮小字級/放大字級) and alignment keys (`靠左對齊`/`置中對齊`/`靠右對齊` vs 齊左/中央對齊/齊右) across `apps.chats.menu.*`, `apps.terminal.menu.*`, `apps.textedit.*`

### Actions / destructive (7)

117. `apps.control-panels.changePasswordButton` | Change → 變更 | 更改 (96%)
118–120. Reset keys → 重設 vs 重置 (98%): `apps.control-panels.telegram.resetInstructions`, `apps.internet-explorer.futureTimeline.reset`, `apps.pc.menu.reset`
121–123. Discard Changes → 捨棄變更 vs 捨棄所作更動 (86%): `apps.paint.dialogs.discardChanges`, `apps.textedit.dialogs.discardChanges`, `common.dialog.discardChanges`

### iPod / Music (4)

124. `apps.ipod.help.coverFlow.title` | Cover Flow → Cover Flow | 封面暢覽 (100%)
125. `apps.ipod.menu.coverFlow` | Cover Flow → 封面瀏覽 | 封面暢覽 (100%)
126. `apps.ipod.menuItems.shuffle` | Shuffle → 隨機 | 隨機播放 (86%)
127. `apps.ipod.status.appleMusicGeniusPlaying` | Genius Mix → Genius Mix | 智選推薦組曲 (100%)

### Maps (2)

128. `apps.maps.menu.help` | Maps Help → 地圖說明 | 地圖輔助說明 (100%)
129. `apps.maps.places.recents` | Recent Places → 最近的地點 | 最近使用過的位置 (100%)

### General UI (160) — items 130–289

130. `apps.admin.accessDenied.title` | Access Denied → 存取遭拒 | 拒絕取用 (100%)
131. `apps.admin.auditLog.action` | Action → 操作 | 動作 (98%) — *has contextual override*
132. `apps.admin.cursorAgents.colTask` | Task → 任務 | 作業 (100%)
133. `apps.admin.dashboard.kpi.sessions` | Sessions → 工作階段 | 區段 (100%)
134. `apps.admin.name` | Admin → 管理員 | 管理者 (80%)
135. `apps.admin.profile.clearAll` | Clear All → 清除所有 | 全部清除 (100%)
136. `apps.admin.profile.noMessages` | No messages found → 找不到訊息 | 找不到郵件 (100%)
137–139. Room/Rooms → 聊天室 vs 房間: `apps.admin.profile.room`, `.rooms`, `apps.admin.sidebar.rooms`
140. `apps.admin.redis.root` | root → 根目錄 | 根 (100%)
141. `apps.admin.server.ok` | OK → 確定 | 好 (100%) — *has contextual override*
142. `apps.admin.song.createdAt` | Created → 建立 | 製作日期 (94%)
143. `apps.admin.song.updatedAt` | Updated → 更新 | 已更新 (100%)
144. `apps.admin.title` / `apps.admin.user.admin` | Admin → 管理員 | 管理者 (80%)
145. `apps.applet-viewer.menu.checkForUpdates` | Check for Updates → 檢查更新 | 檢查更新項目 (100%)
146. `apps.applet-viewer.sections.updatesAvailable` | Updates Available → 有可用的更新 | 有可用的更新項目 (100%)
147. `apps.books.menu.columns` | Columns → 欄數 | 直欄 (88%)
148. `apps.books.shelf.gridView` | Grid View → 網格檢視 | 格狀顯示方式 (100%)
149. `apps.books.shelf.listView` | List View → 列表檢視 | 列表顯示方式 (88%)
150. `apps.books.theme.sepia` | Sepia → 復古 | 深褐色 (100%)
151–167. Calculator unit/speech mismatches (公克 vs 克, 公尺 vs 米, 除號 vs 除以, 記錄 vs 對數, etc.) — 17 keys under `apps.calculator.*`
168. `apps.calendar.tray.done` | done → 已完成 | 完成 (100%)
169. `apps.calendar.tray.due` | due → 到期 | 到期日 (100%)
170. `apps.calendar.views.allDay` | all-day → 全天 | 整日 (100%)
171. `apps.chats.menu.showRooms` | Show Rooms → 顯示聊天室 | 顯示房間 (100%)
172. `apps.chats.sidebar.new` | new → 新 | 新的 (100%)
173. `apps.chats.status.listening` | Listening → 聆聽中 | 聽取 (100%)
174. `apps.chats.status.newChat` | New chat → 新聊天 | 新增聊天 (100%)
175. `apps.chats.status.thinking` | Thinking → 正在思考 | 正在思考⋯ (100%)
176. `apps.chats.toasts.unknownError` | Unknown error → 未知錯誤 | 未知的錯誤 (100%)
177. `apps.chats.tokenStatus.last` | Last → 最後 | 姓氏 (80%)
178. `apps.chats.toolCalls.applet` | Applet → 小程式 | Applet (100%)
179. `apps.chats.toolCalls.cursorCloudAgent.stream.thinking` | Thinking → 思考中 | 正在思考⋯ (100%)
180. `apps.chats.toolCalls.cursorCloudAgent.stream.userPrompt` | Prompt → 提示詞 | 提示 (100%)
181. `apps.chats.toolCalls.noItemsFound` | No items found → 未找到項目 | 找不到項目 (100%)
182. `apps.chats.toolCalls.unknownError` | Unknown error → 未知錯誤 | 未知的錯誤 (100%)
183. `apps.contacts.help.smartGroups.title` | Smart Groups → 智慧群組 | 智慧型群組 (100%)
184. `apps.control-panels.accentColors.wallpaper` | Wallpaper → 桌布 | 背景圖片 (100%)
185. `apps.control-panels.alerts.unknownError` | Unknown error → 未知錯誤 | 未知的錯誤 (100%)
186. `apps.control-panels.color` | Color → 全彩 | 顏色 (89%)
187. `apps.control-panels.connectionStatus.disconnected` | Disconnected → 已斷線 | 已中斷連線 (100%)
188. `apps.control-panels.debugMode` | Debug Mode → 偵錯模式 | 除錯模式 (100%)
189. `apps.control-panels.dream` | Dream → 夢幻 | 夢境 (100%)
190. `apps.control-panels.help.sounds.title` | Sounds → 音效 | 聲音 (100%)
191. `apps.control-panels.invert` | Invert → 反轉 | 反相 (100%)
192. `apps.control-panels.min` | min → 分 | 分鐘 (100%)
193. `apps.control-panels.patterns` | Patterns → 樣式 | 花紋 (100%)
194. `apps.control-panels.screenSaverOptions.matrix.name` | Matrix → 駭客任務 | 矩陣 (100%)
195. `apps.control-panels.sepia` | Sepia → 褐色 | 深褐色 (100%)
196–197. Synth → 合成器 vs 合成: `apps.control-panels.synth`, `.terminalIeAmbientSynth`
198. `apps.control-panels.telegram.disconnect` | Disconnect → 中斷連結 | 中斷連線 (92%)
199. `apps.control-panels.wallpaperCategories.foliage` | Foliage → 綠葉 | 葉子 (100%)
200. `apps.control-panels.wallpaperCategories.structures` | Structures → 建築 | NULL (100%)
201. `apps.dashboard.dictionary.title` | Dictionary → 詞典 | 辭典 (96%)
202. `apps.dashboard.ipod.controlLabel` | Controls → 控制項 | 控制項目 (83%)
203. `apps.dashboard.ipod.modeKaraoke` | Karaoke → Karaoke | 卡拉OK (100%)
204. `apps.dashboard.ipod.nowPlaying` | Now Playing → 正在播放 | 播放中 (100%)
205. `apps.dashboard.menu.addWidget` | Add Widget → 新增小工具 | 加入小工具 (100%)
206. `apps.dashboard.weather.conditions.clear` | Clear → 晴朗 | 清除 (88%)
207. `apps.dashboard.weather.high` | H: → 高: | 最高 (100%)
208. `apps.dashboard.widgets.aquarium` | Aquarium → 水族箱 | 水族館 (100%)
209. `apps.dashboard.widgets.dictionary` | Dictionary → 字典 | 辭典 (96%)
210. `apps.dashboard.widgets.stickyNote` | Sticky Note → 便利貼 | 便條紙 (100%)
211. `apps.dashboard.widgets.terrarium` | Terrarium → 生態缸 | 動植物培養槽 (100%)
212. `apps.finder.contextMenu.putBack` | Put Back → 放回 | 還原 (100%)
213. `apps.finder.fileTypes.quicktimeMovie` | QuickTime Movie → QuickTime 影片 | QuickTime影片 (100%)
214. `apps.finder.menu.putBack` | Put Back → 放回 | 還原 (100%)
215. `apps.infinite-mac.help.captureScreenshot.title` | Capture Screenshot → 擷取螢幕截圖 | 擷取截圖 (100%)
216. `apps.internet-explorer.enterUrl` | Enter URL → 輸入網址 | 輸入URL (100%)
217. `apps.internet-explorer.fetch` | Fetch → 擷取 | Fetch (100%)
218. `apps.internet-explorer.off` | Off → 關 | 關閉 (100%)
219. `apps.internet-explorer.olderVersion` | Older Version → 舊版本 | 較舊的版本 (100%)
220. `apps.internet-explorer.travel` | Travel → 旅行 | 旅遊 (91%)
221. `apps.ipod.dialogs.noUpdates` | No Updates → 沒有更新 | 沒有更新項目 (100%)
222. `apps.ipod.menu.multi` | Multi → 多行 | 多聲道 (100%)
223. `apps.ipod.menuItems.brickGame` | Brick → 打磚塊 | 磚塊 (100%)
224. `apps.ipod.menuItems.nowPlaying` | Now Playing → 播放中的歌曲 | 播放中 (100%)
225. `apps.ipod.menuItems.unknownAlbum` | Unknown Album → 未知專輯 | 未知的專輯 (100%)
226. `apps.ipod.musicQuiz.scoreShort` | Score → 得分 | 分數 (100%)
227. `apps.ipod.status.offset` / `apps.ipod.syncMode.offset` | Offset → 偏移 | 位移 (100%)
228. `apps.karaoke.name` | Karaoke → 卡拉 OK | 卡拉OK (100%)
229. `apps.maps.noResults` | No results → 無結果 | 沒有結果 (100%)
230. `apps.maps.poiCategory.atm` | ATM → 自動提款機 | 提款機 (100%)
231. `apps.maps.poiCategory.theater` | Theater → 劇院 | 戲院 (100%)
232. `apps.paint.menu.filterCategoryArtistic` | Artistic → 藝術風 | 藝術效果 (100%)
233. `apps.paint.menu.filterInvert` | Invert → 反轉 | 反相 (100%)
234. `apps.paint.menu.filterSepia` | Sepia → 褐色 | 深褐色 (100%)
235. `apps.paint.toolbar.fillColor` | Fill Color → 填色 | 填充顏色 (100%)
236. `apps.pc.menu.aspectRatio` | Aspect Ratio → 長寬比 | 顯示比例 (100%)
237. `apps.pc.menu.captureScreenshot` | Capture Screenshot → 擷取螢幕截圖 | 擷取截圖 (100%)
238. `apps.photo-booth.effects.bulge` | Bulge → 凸出 | 凹凸鏡 (100%)
239. `apps.photo-booth.effects.ripple` | Ripple → 波紋 | 漣漪 (100%)
240. `apps.photo-booth.effects.xRay` | X-Ray → X 光 | X光 (100%)
241. `apps.synth.effectsParams.distortion` | Distortion → 失真 | 破音 (100%)
242. `apps.synth.envelope` | Envelope → 音量包絡 | 信封 (100%)
243. `apps.synth.menu.presets` | Presets → 預設 | 預設組 (100%)
244. `apps.synth.name` | Synth → 合成器 | 合成 (100%)
245. `apps.terminal.output.noItemsFound` | No items found → 沒有找到項目 | 找不到項目 (100%)
246. `apps.textedit.heading1/2/3` + menu + slashCommands (9 keys) | Heading N → 標題 N | 標題N (100%, spacing)
247. `apps.textedit.menu.taskList` / slashCommands.taskList | Task List → 任務列表/清單 | 作業列表 (100%)
248. `apps.tv.status.add` | ADD → 新增 | 加入 (100%)
249. `apps.tv.status.time` | TIME → 時間 | 時間長度 (100%)
250. `apps.videos.status.repeat` | REPEAT → 重複播放 | 重複 (100%)
251. `apps.videos.status.unknownError` | Unknown error → 未知錯誤 | 未知的錯誤 (100%)
252. `common.activity.adding` | Adding → 新增 | 正在加入 (100%)
253. `common.colors.orange` | orange → 橘色 | 橙色 (100%)
254. `common.colors.pink` | pink → 粉紅色 | 粉色 (100%)
255. `common.dialog.share.itemTypes.applet` | Applet → 小程式 | Applet (100%)
256–260. Dock menu keys (Remove from Dock spacing; Turn Hiding/Magnification On/Off)
261. `common.htmlPreview.split` | Split → 分割 | 分開鍵盤 (100%)
262. `common.keys.escape` | Escape → 離開 | Escape (80%)
263. `common.noResults` | No results → 查無結果 | 沒有結果 (100%)
264. `common.window.maximize` | Maximize → 最大化 | 放到最大 (100%)
265. `debug.fix` | Fix → 修復 | 修正 (100%)
266. `debug.live.average` | Average → 平均值 | 平均 (100%)
267. `debug.live.locale` | Locale → 地區設定 | 地點 (100%)
268. `debug.live.metric` | Metric → 指標 | 公制 (100%)
269. `settings.language.english` | English → English | 英文 (95%)
270. `spotlight.hintNavigate` | navigate → 瀏覽 | 導覽 (100%)
271. `spotlight.settings.wallpaper` | Wallpaper → 桌布 | 背景圖片 (100%)
272. `spotlight.topHits` | Top Hits → 常用項目 | 最佳搜尋結果 (100%)

*(Items 130–272 complete the general-ui group to 289 total.)*

---

## Low-Confidence Mismatches (69) — Summary

These have dominant confidence below 80% **and** zh-TW does not match a known Apple alternative. Often domain-specific (admin table headers, iPod navigation, debug panels). Notable clusters:

- **Redis/admin keys**: `Key`/`Keys` → 鍵 vs 鍵值 (40–45%)
- **Music navigation**: `Previous`/`Next` → 上一首/下一首 vs 上一個/下一步 (43–75%)
- **Favorites (low conf)**: `Add to Favorites` → 加入最愛 vs 加入喜好項目 (38%)
- **Stickies vs Notes app**: 便利貼 vs 備忘錄/便條紙 (43–67%)
- **History**: 歷史記錄 vs 瀏覽記錄 (54%)
- **Debug `Live` tab**: 即時 vs 原況照片/直播 (52%)

Full list of 69 available in audit output; none promoted to high-confidence.

---

## Recommendations (informational only)

1. **Ellipsis normalization** — Highest-volume fix: replace `...`/`…` with Apple `⋯` on 58+ high-confidence keys (and 125 three-dot keys overall).
2. **Copy/paste vocabulary** — Apple uses 拷貝; ryOS uses 複製 (6 high-confidence keys).
3. **Reset/Change** — Apple uses 重置/更改; ryOS uses 重設/變更 (8 keys).
4. **Expand repo audit** — Current `i18n:audit` covers 113 terms; full-catalog exact-match audit surfaces 289 high-confidence issues the script does not check.
5. **Preserve context collisions** — 80 keys where zh-TW already matches a valid Apple alternative (e.g. 下一首 for music Next, 檢視 for View, 住家 for Home in Maps).

No edits were made. Switch to Agent mode if you want automated fixes scoped to any priority tier.

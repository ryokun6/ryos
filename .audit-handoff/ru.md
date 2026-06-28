# Russian locale audit vs AppleGlot macOS glossary

Read-only audit of `src/lib/locales/ru/translation.json` against `src/lib/locales/en/translation.json` and the mounted **Russian.dmg** glossary (`/Volumes/Russian`, SHA256 `d6c4d758…` per `scripts/apple-ui-terminology-data.ts`).

---

## Executive summary

The **official ryOS 114-term Apple UI audit passes** (`bun scripts/audit-translations.ts` → 0 `ru` issues). All 227 keys whose English values exactly match tracked Apple bases (after ellipsis normalization) align with expected Russian, **except 14 keys with documented contextual overrides** in `scripts/apple-ui-terminology.ts`.

Broader full-catalog matching (1,346 EN keys whose string exactly equals *some* AppleGlot base among **125,951** unique bases) surfaces **233 high-confidence dominant-term mismatches**, but most are **homograph collisions** (e.g. `"Last"` → Contacts “Фамилия” vs token UI). The actionable nomenclature issues are concentrated in **account wording**, **Upload/Download**, **Delete Account**, **one Sign Out menu string**, **punctuation**, and **CLDR plurals**.

---

## Metrics

| Metric | Value |
|--------|------|
| Total EN keys | 3,754 |
| Total RU keys | 3,762 |
| Missing RU keys | 0 |
| Extra RU keys (CLDR `few`/`many` only) | 8 |
| `[TODO]` in RU | 0 |
| Placeholder mismatches (`{{…}}` audit logic) | 0 |
| Identical to EN (>2 chars, intentional product names) | 150 |
| **Tracked Apple UI terms** (114-term list) | 114 |
| EN keys matching tracked base (exact) | 241 |
| Tracked-term matches (incl. contextual OK) | 241 / 241 |
| Tracked-term mismatches (non-contextual) | **0** |
| Documented contextual overrides | **14** |
| Unique AppleGlot base strings parsed | 125,951 |
| EN keys matching *any* glossary base (exact) | 1,346 |
| Full-catalog dominant-term matches (≥80% confidence) | 929 + 14 contextual |
| Full-catalog dominant-term mismatches (≥80%) | 233 |
| Full-catalog valid Apple alt used (context collision) | 2 (+ 14 intentional overrides) |
| Full-catalog low-confidence bases (<80%) | 168 |
| RU strings with ASCII `...` where EN uses `…` | **136** |
| RU strings ending with Unicode `…` | 128 |
| EN strings ending with `…` | 265 |
| `учет` vs `учёт` orthography split | 18 vs 2 strings |
| `аккаунт` loanword in account contexts | 15 keys |
| `учетная запись` (Apple canonical) | 23+ keys |

---

## Methodology

1. Parsed all `*.lg` XML files in Russian.dmg (`<base>` / `<tran>` pairs).
2. **Tier A — tracked terms:** 114 ryOS-extracted Apple UI labels via `getExpectedAppleUiTerm()` (same as CI).
3. **Tier B — full catalog:** exact EN string → dominant Russian translation (≥80% of glossary hits); flagged when RU ≠ dominant.
4. **Tier C — classification:** separated homograph collisions, intentional overrides, punctuation-only, account/button/Upload-Download patterns.

---

## Tier A: Tracked Apple UI terminology — PASS

All 227 non-override exact matches align with `scripts/apple-ui-terminology-data.ts`. Examples verified against glossary:

| English | Apple RU (dominant) | Status |
|---------|---------------------|--------|
| Settings | Настройки | ✓ |
| Account | Учетная запись | ✓ (`apps.control-panels.accountMenu`) |
| Sign In | Войти (57×) | ✓ |
| Sign Out | Выйти (33×) | ✓ (most keys) |
| Cancel | Отменить (1617×) | override → Отмена (see below) |
| Trash | Корзина | ✓ |
| Copy | Копировать | ✓ |

---

## Tier B: Documented contextual overrides (14 keys)

These **intentionally diverge** from the Apple dominant term. Repo documents them in `APPLE_UI_CONTEXTUAL_TERMINOLOGY`.

| Key | EN | RU (current) | Apple dominant | Apple alt evidence | Classification |
|-----|----|--------------|----------------|--------------------|----------------|
| `common.dialog.cancel` | Cancel | **Отмена** | Отменить | Отмена 10× / Отменить 1617× | **Context collision** — minor Apple alt; noun label vs imperative verb |
| `apps.chats.dialogs.cancel` | Cancel | Отмена | Отменить | same | Context collision |
| `apps.karaoke.liveListen.cancel` | Cancel | Отмена | Отменить | same | Context collision |
| `apps.control-panels.deleteAccount.cancel` | Cancel | Отмена | Отменить | same | Context collision |
| `apps.calendar.event.cancel` | Cancel | Отмена | Отменить | same | Context collision |
| `apps.contacts.picturePicker.cancel` | Cancel | Отмена | Отменить | same | Context collision |
| `common.dialog.saveChanges` | Save Changes | **Сохранить изменения** | Сохранить | Сохранить 7×, Сохранить изменения 1× | Context collision — Apple usually shortens button |
| `apps.textedit.dialogs.saveChanges` | Save Changes | Сохранить изменения | Сохранить | same | Context collision |
| `apps.ipod.menu.lyrics` | Lyrics | **Текст песни** | Текст | Текст 9×, Текст песни 1× | Context collision |
| `apps.control-panels.dynamicWallpapers.lyrics` | Lyrics | Текст песни | Текст | same | Context collision |
| `apps.admin.song.lyricsSource` | Lyrics | Текст песни | Текст | same | Context collision |
| `apps.maps.placeCard.directions` | Directions | **Маршрут** | **Маршруты** | Маршруты 23× (no singular alt) | **Nomenclature mismatch** — override picks non-glossary form |
| `apps.maps.help.directions.title` | Directions | Маршрут | Маршруты | same | Nomenclature mismatch |
| `apps.admin.server.ok` | OK | ОК | ОК 704× / OK 335× | Valid either form | Context collision |

**Button noun-vs-verb note:** Apple macOS overwhelmingly uses imperative **Отменить** on Cancel buttons (1617× in glossary). **Отмена** exists but is rare (10×, e.g. `XTypeUI_executables.lg`, `SyncServices2_executables.lg`). ryOS chose the noun form deliberately for dialog chrome.

---

## Tier C: High-confidence nomenclature mismatches

### 1. Account terminology — mixed `аккаунт` vs Apple `учетная запись`

Apple glossary: **`Account` → Учетная запись (37×)**; **`Create Account` → Создать учетную запись (3×)**. No glossary entry for `Verify Account`.

| Key | EN | RU (current) | Expected (Apple-style) | Evidence |
|-----|----|--------------|------------------------|----------|
| `common.auth.createAccount` | Create Account | **Создать аккаунт** | Создать учетную запись | Glossary Create Account; contrasts with `common.appleMenu.createAccount` → Создать **учётную** запись… |
| `common.auth.loginDescription` | Sign in to your account | Войдите в свой **аккаунт** | …учетную запись | Account → Учетная запись |
| `common.auth.signupDescription` | Create an account to… | Создайте **аккаунт**… | Создайте учетную запись… | Create Account glossary |
| `common.auth.logOutDescription` | …sign out of your account? | …от своего **аккаунта** | …учетной записи | Account glossary |
| `common.auth.recovery.codeSent` | If an account matches… | Если **аккаунт** найден… | Если учетная запись найдена… | Account glossary |
| `common.auth.changePassword.toastSetDescription` | …recover your account | …восстановления **аккаунта** | …учетной записи | Account glossary |
| `common.auth.setPasswordRequiredDescription` | …recover your account… | …восстановления **аккаунта**… | …учетной записи… | Account glossary |
| `common.auth.verifyEmailDescription` | …securing your account | …своего **аккаунта** | …учетной записи | Account glossary |
| `apps.chats.status.createAccountToContinue` | Create account to continue… | Создайте **аккаунт**… (+ ASCII `...`) | Создайте учетную запись… | Create Account + punctuation |
| `apps.tv.create.signInRequiredDescription` | …create an account… | …создайте **аккаунт**… | …учетную запись… | Create Account |
| `apps.control-panels.email.linkForRecovery` | …account recovery | …восстановления **аккаунта** | …учетной записи | Account |
| `apps.control-panels.telegram.loggedOutDescription` | …your ryOS account | …**аккаунту** ryOS | …учетной записи ryOS | Account |
| `apps.control-panels.recoveryEmail.notConfigured` | …linked Telegram account | …**аккаунт** Telegram | …учетная запись Telegram | Account |
| `apps.control-panels.verifyAccount` | Verify Account | **Подтвердить аккаунт** | Подтвердить учетную запись (pattern) | No glossary entry; loanword |
| `apps.admin.help.userManagement.description` | …rename accounts | …переименовывайте **аккаунты** | …учетные записи | Account plural |

**Orthography sub-issue:** 18 strings use `учет` (without ё), 2 use `учёт` (`common.appleMenu.createAccount`, `apps.control-panels.logOutRowDescription`). Apple glossary consistently uses **учет** (no ё).

---

### 2. Sign Out vs Log Out — wrong glossary term on Apple menu

| Key | EN | RU (current) | Expected | Evidence |
|-----|----|--------------|----------|----------|
| `common.appleMenu.logOut` | **Sign Out** {{username}}… | **Завершить сеанс** {{username}}… | **Выйти** {{username}}… | Sign Out → Выйти (33×); Завершить сеанс maps to **Log Out** (5×). Placeholder prevents tracked-term audit from catching this. |

---

### 3. Delete Account — Apple short form vs full phrase

| Key | EN | RU (current) | Apple dominant | Evidence |
|-----|----|--------------|----------------|----------|
| `apps.control-panels.deleteAccount.title` | Delete Account | Удалить **учетную запись** | **Удалить запись** | Delete Account 1× in glossary |
| `apps.control-panels.deleteAccount.submit` | Delete Account | Удалить учетную запись | Удалить запись | same |
| `apps.control-panels.deleteAccountMenu` | Delete Account… | Удалить учетную запись… | Удалить запись… | same |

Using the longer form is grammatically clear but **not** the AppleGlot string.

---

### 4. Upload / Download — Apple distinguishes upload vs download

Apple consistently uses **Выгрузить/Выгрузка** for Upload and **Загрузить** for Download. ryOS conflates both toward “загруз-”:

| Key | EN | RU (current) | Apple dominant | Evidence |
|-----|----|--------------|----------------|----------|
| `apps.control-panels.cloudSync.forceUpload` | Upload | **Загрузить** | **Выгрузить** | Upload 3× Выгрузить |
| `apps.control-panels.cloudSync.forceUploading` | Uploading… | **Загрузка…** | **Выгрузка…** | Uploading 5× Выгрузка |
| `apps.control-panels.autoSync.uploading` | Uploading | **Загрузка** | **Выгрузка** | same |
| `apps.control-panels.cloudSync.forceDownload` | Download | **Скачать** | **Загрузить** | Download 61× Загрузить |
| `updates.download` | Download | **Скачать** | **Загрузить** | same |

---

### 5. Backup — noun vs process label

| Key | EN | RU (current) | Apple dominant | Evidence |
|-----|----|--------------|----------------|----------|
| `apps.control-panels.backup` | Backup | **Резервное копирование** | **Резервная копия** | Backup 1× |
| `apps.control-panels.cloudSyncTabs.backup` | Backup | Резервное копирование | Резервная копия | same |
| `apps.admin.redis.backup` | Backup | Резервное копирование | Резервная копия | same |
| `apps.control-panels.cloudSync.backingUp` | Backing up… | **Создание резервной копии…** | **Резервное копирование…** | Backing up 1× |

Uses gerund/process wording instead of Apple’s nominal **Резервная копия**.

---

### 6. Email terminology

| Key | EN | RU (current) | Apple dominant | Evidence |
|-----|----|--------------|----------------|----------|
| `apps.contacts.fields.emails` | Email Addresses | **Адреса электронной почты** | **Адреса e-mail** | Email Addresses 2× |

Apple prefers **e-mail** branding over spelled-out почта in this label.

---

### 7. CLDR plural forms (Russian: one / few / many / other)

| Base key | Present | Missing | Impact |
|----------|---------|---------|--------|
| `apps.admin.statusBar.auditLogCount` | one, few, many, other | — | ✓ (test-covered) |
| `apps.admin.statusBar.redisKeysCount` | one, few, many, other | — | ✓ |
| `apps.ipod.menuItems.playlistTrackCount` | one, few, many, other | — | ✓ (test-covered) |
| `apps.tv.toasts.importSuccess` | one, few, many, other | — | ✓ |
| **`apps.contacts.status.cardsCount`** | **_one only_** | **few, many, other** | **count=2 → falls back incorrectly**; e.g. “2 карточка” instead of “2 карточки” |

Evidence: only `apps.contacts.status.cardsCount_one` = `{{count}} карточка` exists; `cardsCount_few/other/many` absent.

---

### 8. Punctuation — ASCII ellipsis (136 keys)

Apple glossary uses Unicode **…** (e.g. `Loading…` → `Загрузка…`, 11 files). **136 RU strings use ASCII `...`** where the EN source ends with `…`.

Representative high-traffic keys:

| Key | EN | RU |
|-----|----|----|
| `common.loading.default` | Loading… | Загрузка**...** |
| `common.auth.loggingIn` | Signing in… | Вход**...** |
| `apps.control-panels.loggingOut` | Signing out… | Выход**...** (Apple: **Выполняется выход…**) |
| `apps.admin.redis.loading` | Loading… | Загрузка**...** |
| `apps.chats.status.recording` | Recording… | Запись**...** |
| `apps.applet-viewer.menu.createAccount` | Create Account… | Создать учетную запись**...** |
| `apps.chats.status.createAccountToContinue` | Create account to continue… | …продолжить**...** |

Full count: **136 keys** (every case where EN ends with `…` and RU contains `...`).

---

### 9. English leak (localizable string left in English)

| Key | EN | RU | Apple dominant |
|-----|----|----|----------------|
| `settings.language.english` | English | **English** | **Английский** (21×) |

Other identical EN/RU strings (150 total) are mostly product names (Finder, Redis, OpenAI, theme names) — acceptable.

---

### 10. “About …” / “… Help” menu pattern (10 keys)

Apple pattern: **О приложении «AppName»** / **Справка AppName** (genitive, guillemets).

| Key | RU (current) | Apple dominant |
|-----|--------------|----------------|
| `apps.calculator.menu.about` | О калькуляторе | О приложении «Калькулятор» |
| `apps.calendar.menu.about` | О Календаре | О приложении «Календарь» |
| `apps.contacts.menu.about` | О контактах | О приложении «Контакты» |
| `apps.control-panels.menu.aboutControlPanelsForMacosX` | О Системных настройках | О приложении «Системные настройки» |
| `apps.finder.menu.aboutFinder` | О Finder | О приложении Finder |
| `apps.textedit.menu.aboutTextEdit` | О TextEdit | О приложении TextEdit |
| `apps.stickies.menu.about` | О программе «Стикеры» | О приложении «Записки» |
| `apps.videos.menu.aboutVideos` | О программе «Видео» | О приложении «Видео» |
| `apps.tv.menu.about` | О TV | О приложении TV… |
| `apps.photo-booth.menu.aboutPhotoBooth` | О приложении Фотокабина | О приложении Photo Booth |

Related Help strings (same pattern): e.g. `apps.calculator.menu.help` RU **Справка по калькулятору** vs Apple **Справка Калькулятора**.

---

### 11. Placeholder / bracket localization (informational)

| Key | EN placeholder | RU placeholder | Audit |
|-----|----------------|------------------|-------|
| `apps.terminal.help.aiAssistant.description` | `<prompt>` | `<запрос>` | Localized (not a `{{}}` mismatch) |
| `apps.terminal.help.fileEditing.description` | `<file>` | `<файл>` | Localized |

`{{count}}`, `{{username}}`, etc.: **0 mismatches** vs EN.

---

## Tier D: Context collisions (valid Apple alternatives, not dominant)

### Statistical collisions from full catalog (RU matches a ≥15% Apple alt)

| Key | EN | RU | Dominant | Valid alt used |
|-----|----|----|----------|----------------|
| `apps.calculator.conversion.units.cal` | Calories | **Калории** | Килокалории (82%) | Калории 7× |
| `apps.calculator.conversion.units.j` | Joules | **Джоули** | Дж (83%) | Джоули 1× |

### Intentional overrides using rare but attested alts

Already listed in Tier B (Cancel/Отмена, Save Changes full phrase, Lyrics/Текст песни, OK/ОК).

---

## Tier E: Full-catalog homograph collisions (NOT nomenclature bugs)

233 dominant-term mismatches include many cases where the **English string equals an Apple base in a different semantic domain**. These should **not** be “fixed” blindly:

| Key | EN | RU | Apple dominant | Why it’s a collision |
|-----|----|----|----------------|----------------------|
| `apps.chats.tokenStatus.last` | Last | Последний | **Фамилия** | Contacts “Last name” |
| `apps.admin.profile.memoryKey` | Key | Клавиша | **Ключ** | Crypto/key vs keyboard |
| `apps.chats.status.thinking` | Thinking | Думаю | **Минуточку** | Siri wait state |
| `apps.chats.toolCalls.cursorCloudAgent.stream.thinking` | Thinking | Размышление | Минуточку | same |
| `apps.chats.status.listening` | Listening | Слушаю | **Прослушивание** | VoiceOver vs chat |
| `apps.calendar.event.startTime` | Start Time | Время начала | **Время запуска** | Calendar event vs app launch |
| `apps.calculator.menu.about` | About Calculator | О калькуляторе | О приложении «Калькулятор» | See Tier C §10 |
| `debug.live.locale` | Locale | Локаль | **Регион** | Debug metric vs System Settings |
| `apps.control-panels.accentColors.purple` | Purple | Фиолетовый | **Лиловый** | Apple color name vs generic |

**168** additional full-catalog matches had **<80% dominant confidence** (glossary disagreement).

---

## Grammatical case notes

- **Russian plural rules** for existing count keys (`запись/записи/записей`, `ключ/ключа/ключей`, `песня/песни/песен`, `канал/канала/каналов`) are **correct** where all four CLDR forms exist.
- **`apps.contacts.status.cardsCount`** lacks `few`/`many`/`other` → **genitive/case errors at runtime** for counts 2–4, 5+, etc.
- **Account strings** mix nominative (`аккаунт`), genitive (`аккаунта`), and dative (`аккаунту`) with loanword **аккаунт**; Apple uses **учетная запись** with consistent declension (`учетной записи`, etc.).

---

## Summary scorecard

| Area | Result |
|------|--------|
| Official 114-term Apple UI audit | **PASS** |
| Documented contextual overrides | 14 (6× Cancel, 2× Save Changes, 3× Lyrics, 2× Directions, 1× OK) |
| Account terminology consistency | **FAIL** — 15× `аккаунт` vs Apple `учетная запись` |
| Sign Out menu string | **FAIL** — uses Log Out wording |
| Upload/Download | **FAIL** — 5 keys inverted vs Apple |
| Delete Account label | **WARN** — longer non-glossary form |
| CLDR plurals | **FAIL** — `cardsCount` incomplete |
| Ellipsis punctuation | **FAIL** — 136 ASCII `...` |
| English leak | **1** — `settings.language.english` |
| Placeholders `{{}}` | **PASS** |

No files were modified. To apply fixes, switch to Agent mode.

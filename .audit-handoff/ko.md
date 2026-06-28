# Korean (`ko`) Full-Catalog AppleGlot Audit

Read-only audit of `src/lib/locales/ko/translation.json` against `src/lib/locales/en/translation.json` and the official AppleGlot macOS glossary from `Korean.dmg` (679 `.lg` files, **122,201** unique English base strings). Glossary SHA256 matches the repo pin: `b598d6c4…49ed3`.

---

## Executive summary

| Layer | Result |
|-------|--------|
| **Curated 113-term audit** (`auditTranslations()`) | **0 issues** — 241/241 key instances match |
| **Full exact-base glossary match** | 1,412 keys where English equals an AppleGlot base string |
| **High-confidence mismatches (≥80%)** | **290** keys |
| **Context collisions (<80%)** | **118** keys |
| **Structural hygiene** | 0 missing keys, 0 extra keys, 0 `[TODO]`, 0 placeholder drift, 0 CLDR plural gaps |

The curated tier is in excellent shape. The broader catalog reveals systematic gaps in **ellipsis punctuation**, **menu command phrasing**, **암호 vs 비밀번호**, and **loanword vs native Apple terms**—plus many homograph collisions where the same English base maps to different concepts.

---

## Methodology

1. Parsed all `TranslationSet` entries in `Korean.dmg` → dominant Korean translation per English base (same approach as `scripts/extract-apple-terminology.py`).
2. Flattened 3,754 translation keys; matched when `en` value **exactly** equals a glossary base (including ellipsis-stripped variants with `…` appended).
3. **High-confidence**: dominant translation ≥80% of hits.
4. **Context collision**: dominant <80%, or English homograph clearly wrong for UI context (e.g. weather “Clear” vs menu “Clear”).
5. Cross-checked against repo curated terms via `getExpectedAppleUiTerm()` and contextual overrides in `scripts/apple-ui-terminology.ts`.

---

## Metrics

| Metric | Count |
|--------|------:|
| Glossary base strings | 122,201 |
| `.lg` files parsed | 679 |
| Translation keys (en = ko) | 3,754 |
| Unique English string values | 3,093 |
| Unique English values found in glossary | 855 |
| Keys with exact glossary base match | 1,412 |
| Curated Apple term instances (113 terms) | 241 pass / 0 fail |
| **High-confidence glossary mismatches** | **290** |
| — punctuation/ellipsis only | 33 |
| — spacing/compound only | 5 |
| — color suffix (보라 vs 보라색) | 5 |
| — likely homograph collision (within high-conf set) | 15 |
| — semantic nomenclature | ~232 |
| Context collisions (<80% confidence) | 118 |
| English leaks (heuristic) | 27 |
| KO ASCII ellipsis (`...` vs `…`) | 131 keys |
| Counter spacing pattern flags | 28 |
| Menu/command-path mismatches (high-conf) | 104 |

---

## Tier 1: Curated Apple terminology — PASS

All **113** extracted terms used across **241** key instances match Apple Korean, including contextual overrides. Examples that pass:

| English | Apple KO | Sample key |
|---------|----------|------------|
| Sign In | 로그인 | auth flows |
| Cancel | 취소 | dialogs |
| Password (label) | 암호 | `common.auth.password` |
| Set Password | 암호 설정 | control panels |
| Move to Trash | 휴지통으로 이동 | Finder |
| Full Screen | 전체 화면 | window chrome |

**Note:** `apps.admin.auditLog.action` uses **작업** via intentional contextual override (`APPLE_UI_CONTEXTUAL_TERMINOLOGY`), not glossary-dominant **동작** (89% in AppleGlot). The full-catalog matcher flags this; the repo audit correctly accepts it.

---

## Tier 2: High-confidence nomenclature mismatches

Below: findings where glossary confidence ≥80%, grouped by theme. Evidence shows glossary hit counts from direct `.lg` parsing where noted.

### A. Password terminology — 암호 vs 비밀번호 (Apple: 100% 암호)

AppleGlot evidence:
- `Password` → **암호** (102/102)
- `Reset Password` → **암호 재설정** (17/17)
- `New Password` → **새로운 암호** (2/2)

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `common.auth.recovery.title` | Reset Password | 비밀번호 재설정 | 암호 재설정 |
| `common.auth.recovery.submit` | Reset Password | 비밀번호 재설정 | 암호 재설정 |
| `common.auth.recovery.newPassword` | New Password | **새 비밀번호** | 새로운 암호 |
| `common.auth.changePassword.newPassword` | New Password | 새 암호 | 새로운 암호 |

Prose keys also use **비밀번호** extensively (`passwordMinLengthError`, `forgotPassword`, etc.) while standalone labels use **암호** — inconsistent within the same auth surface.

### B. Standard menu commands — verb form & “About …” pattern

AppleGlot evidence:
- `Redo` → **실행 복귀** (177/177)
- `Select All` → **전체 선택** (187/193; **모두 선택** is 3.1% alt)
- `Put Back` → **되돌려 놓기** (2/2)
- `About Finder` → **Finder에 관하여** (2/2)
- `Enter Full Screen` → **전체 화면 시작** (59/60)
- `Share App…` → **앱 공유하기...** (1/1)

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `common.menu.redo` | Redo | 다시 실행 | 실행 복귀 |
| `common.menu.selectAll` | Select All | 모두 선택 | 전체 선택 |
| `common.dock.showAllWindows` | Show All Windows | 모든 창 보기 | 모든 윈도우 보기 |
| `common.dock.turnHidingOn` | Turn Hiding On | 자동 숨김 켜기 | 가리기 켬 |
| `common.dock.turnHidingOff` | Turn Hiding Off | 자동 숨김 끄기 | 가리기 끔 |
| `common.dock.turnMagnificationOn/Off` | Turn Magnification … | 확대 켜기/끄기 | 확대 켬/끔 |
| `common.appleMenu.enterFullScreen` | Enter Full Screen | 전체 화면 사용 | 전체 화면 시작 |
| `common.appMenu.hideOthers` | Hide Others | 다른 항목 가리기 | 기타 가리기 |
| `common.menu.shareApp` | Share App… | 앱 공유... | 앱 공유하기... |
| `apps.finder.menu.putBack` | Put Back | 되돌리기 | 되돌려 놓기 |
| `apps.finder.menu.aboutFinder` | About Finder | Finder 정보 | Finder에 관하여 |
| `apps.textedit.menu.aboutTextEdit` | About TextEdit | 텍스트 편집기 정보 | 텍스트 편집기에 관하여 |
| `apps.photo-booth.menu.aboutPhotoBooth` | About Photo Booth | 포토 부스 정보 | Photo Booth에 관하여 |

Repeated across Calendar, Contacts, Maps, Books, Calculator, Stickies: **`<App> 정보`** vs Apple **`<App>에 관하여`**.

### C. TextEdit / formatting

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `apps.textedit.menu.heading1/2/3` | Heading N | 제목 N | 머리말 N |
| `apps.textedit.menu.format` | Format | 서식 | 포맷 |
| `apps.textedit.menu.underline` | Underline | 밑줄 | 밑줄체 |
| `apps.textedit.menu.alignCenter` | Align Center | 가운데 정렬 | 중앙 정렬 |
| `apps.textedit.slashCommands.taskList.title` | Task List | 할 일 목록 | 작업 목록 |
| `apps.chats.menu.increaseFontSize` | Increase Font Size | 글자 크기 늘리기 | 서체 크기 증가 |
| `apps.chats.menu.decreaseFontSize` | Decrease Font Size | 글자 크기 줄이기 | 서체 크기 감소 |

### D. Music / iPod — loanword vs native (internal inconsistency)

AppleGlot: `Shuffle` → **임의 재생** (29/29, 100%)

| Location | Current KO | Apple KO |
|----------|------------|----------|
| `apps.videos.menu.shuffle`, `apps.ipod.menuItems.shuffle`, etc. | **셔플** / 뒤섞기 | 임의 재생 |
| `apps.ipod.menu.shuffle` (status areas) | **임의 재생** | ✓ |

Other iPod/media terms:

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `apps.*.menu.controls` (7 keys) | Controls | 제어 / **컨트롤** | **제어기** (11/12) |
| `apps.ipod.menu.displayCover` | Cover | 커버 | 표지 |
| `apps.ipod.menu.fontGradient` | Gradient | 그라데이션 | **그라디언트** |
| `apps.ipod.menu.video` | Video | 동영상 | 비디오 |
| `apps.chats.menu.sound` | Sound | 소리 | **사운드** |
| `apps.karaoke.name` | Karaoke | 노래방 | 가라오케 |
| `apps.dashboard.ipod.modeKaraoke` | Karaoke | **Karaoke** (English leak) | 가라오케 |

### E. “New …” vs “새로운 …” pattern

Apple consistently prefers **새로운** over **새** for menu items:

| Examples | Current | Apple |
|----------|---------|-------|
| New Event, New Game, New Note, New Contact | 새 이벤트 / 새 게임 / … | 새로운 이벤트 / 새로운 게임 / … |
| Untitled (5 keys) | 제목 없음 | **무제** (91.2%) |

### F. Window / system chrome

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `common.window.maximize` | Maximize | 최대화 | 확대 |
| `common.toast.reboot` | Reboot | 재부팅 | **재시동** |
| `common.errorBoundaries.relaunch` | Relaunch | 다시 실행 | 재실행 |
| `apps.control-panels.verify` (3 keys) | Verify | 인증 | **확인** |

### G. Retry / status phrasing

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `apps.chats.status.retry` (+2) | Retry | 다시 시도 | **재시도** |
| `apps.chats.status.thinking` (+1) | Thinking | 생각 중 | **처리 중** *(likely wrong sense—see collisions)* |
| `apps.chats.toolCalls.*.paused` | Paused | 일시정지됨 / 일시 중지됨 | **일시 정지됨** |

### H. Terms of Service

| Key | EN | Current KO | Apple KO |
|-----|-----|------------|----------|
| `common.aboutThisMac.termsOfService` | Terms of Service | 이용 약관 | **서비스 약관** |
| `apps.control-panels.termsOfService` | Terms of Service | 이용 약관 | **서비스 약관** |

---

## Tier 3: Punctuation — systematic ellipsis drift (131 keys)

Apple Korean uses Unicode ellipsis **…**; 131 KO strings use ASCII **`...`**. This accounts for **33** of the 290 high-confidence mismatches alone.

Examples:

| Key | Current KO | Apple KO |
|-----|------------|----------|
| `common.loading.default` | 로드 중**...** | 로드 중**…** |
| `common.auth.loggingIn` | 로그인 중**...** | 로그인 중**…** |
| `apps.finder.menu.rename` | 이름 변경**...** | 이름 변경**…** |
| `apps.chats.menu.createAccount` | 계정 생성**...** | 계정 생성**…** |

Mixed direction on trailing ellipsis in menu items (`Empty Trash…`: KO uses `…`, Apple base uses `...` in one glossary entry). English source consistently uses `…`; KO should follow Apple/style guide with **U+2026**.

---

## Tier 4: Spacing & counters

**Spacing (5 high-conf):**
- `변경 사항` vs Apple `변경사항` (Discard Changes)
- `일시정지됨` vs `일시 정지됨` (Paused)
- Color compounds: `놀이공원` vs `놀이 공원`

**Counters (28 flagged, 0 glossary mismatches):** Korean uses **`{{count}}곡`**, **`{{count}}개`** (no space)—consistent and appropriate for KO. Plural keys:

```
apps.ipod.menuItems.playlistTrackCount_one: "{{count}}곡"
apps.ipod.menuItems.playlistTrackCount_other: "{{count}}곡"
```

Correct for Korean (no plural inflection; single `_other` CLDR form present).

---

## Tier 5: Context collisions (118) — NOT high-confidence nomenclature

These English bases have **split glossary distributions** or wrong sense for the ryOS context. Current KO is often reasonable; blind adoption of the dominant term would be wrong.

| Base | Current KO | Glossary dominant | Confidence | Notes |
|------|------------|-------------------|------------|-------|
| `Loading…` | 로드 중... | 로드 중… | 67% | Ellipsis style split; **로드 중...** is 33% alt |
| `Volume` | **볼륨** | 음량 | 69% | Audio menu—볼륨 is common KO loanword |
| `Enter` | **확인** | 입력 | 40% | Keyboard key vs action button |
| `Escape` | **Esc** | Escape | 60% | Abbreviation vs full name |
| `Clear` | **맑음** | 지우기 | 88% | Weather vs edit menu homograph |
| `Left` | **남음** | 왼쪽 | 100% | Minesweeper counter vs direction |
| `Score` | **점수** | 금 | 100% | Quiz score vs Music “Score” |
| `You` | **나** | 사용자 | 100% | Chat pronoun vs account label |
| `Thinking` | **생각 중** | 처리 중 | 100% | AI “thinking” vs progress spinner |
| `Show` | **표시** | 보기 | 80% | Settings toggle vs menu |
| `Light` / `Dark` | **라이트** / **다크** | 라이트 모드 / 어둡게 | 16–55% | Appearance settings |
| `Type` | **종류** | 유형 | 96% | **종류** is 3.8% Apple alt—acceptable |
| `Store` | **상점** | 스토어 | 88% | POI category vs Apple retail |
| `from` / `From` | **출처** / **원본** | 보낸사람 | 50–65% | Share sheet vs mail headers |

---

## Tier 6: English leaks (27)

Most are **acceptable by convention**:

| Category | Examples |
|----------|----------|
| Language autonyms | 中文, 日本語, 한국어, Français, Español, Русский |
| Product names | Photo Booth, Mission Control (F3) |
| Debug/technical | `fps`, `{{count}}/s`, aspect ratios `16:9` |
| Placeholders | `{{username}}`, `{{percent}}%` |

**Actionable leaks:**
- `apps.dashboard.ipod.modeKaraoke` → **Karaoke** (Apple: **가라오케**)
- `settings.language.english` → **English** (Apple: **영어** — though autonym display is debatable)

---

## Tier 7: Native vs loanword policy (22 flagged)

| Pattern | Example | Current | Apple |
|---------|---------|---------|-------|
| KO native, Apple keeps English | Cover Flow, Retro, Dashboard, root | 커버 플로우, 레트로, 대시보드 | Cover Flow, Retro, Dashboard |
| KO loanword, Apple native | Karaoke mode label | Karaoke | 가라오케 |
| Synth/audio (domain-specific) | Delay, Reverb, Distortion | 딜레이, 리버브, 디스토션 | 지연, 잔향, 왜곡 |

Synth/audio loanwords may be intentional for musician-facing UI; iPod/menu surfaces should prefer Apple media terms.

---

## Internal consistency issues (high signal)

1. **Shuffle**: same file uses **임의 재생** (Apple) and **셔플** (menus) interchangeably.
2. **Password**: label **암호** vs recovery flow **비밀번호** / **새 비밀번호**.
3. **Loading**: **로드 중**, **불러오는 중**, **로딩 중** for the same glossary base `Loading`.
4. **Controls**: **제어**, **컨트롤**, vs Apple **제어기**.

---

## What passes cleanly

- All **113 curated** Apple UI terms (241 instances)
- **Placeholder parity**: 0 missing/extra `{{…}}` tokens
- **Key parity**: 3,754/3,754 keys aligned with English
- **CLDR plurals**: Korean `_other` forms present where required
- **No `[TODO]`** markers in KO file

---

## Recommended priority (if fixing later)

1. **Ellipsis normalization** — 131 keys, mechanical `...` → `…`
2. **Password vocabulary** — align recovery UI to **암호** per AppleGlot
3. **Core menu bar** — Redo, Select All, Put Back, About …, Enter Full Screen, dock toggles
4. **iPod Shuffle/Controls** — unify to **임의 재생** / **제어기**
5. **TextEdit headings** — **머리말 N** vs **제목 N**
6. Leave context collisions and synth loanwords for human review

---

*Audit performed read-only; no locale files were modified. Glossary source: `/Users/ryo/Downloads/Glossaries/Korean.dmg` (mounted at `/private/tmp/korean-glossary-dmg`).*

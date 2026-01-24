# Translation Terminology Survey

Survey of terminology used across locale files to find inconsistent translations for the same concept. Standardizing terms improves UX and reduces confusion.

---

## 1. Sticky note (Stickies app)

### zh-TW (Traditional Chinese) — **3 terms for the same concept**

| Key / context | Current translation | Term |
|----------------|---------------------|------|
| `apps.stickies.name`, `title` | 便條紙 | **便條紙** (biàn tiáo zhǐ) — sticky note paper |
| `description`, `empty.*`, `menu.deleteNote`, `menu.clearAll`, `menu.about`, `menu.help`, `help.*` | 便利貼 | **便利貼** (biànlì tiē) — convenience sticker / sticky |
| `menu.newNote`, `menu.note`, `placeholder` | 備忘錄 | **備忘錄** (bèiwàng lù) — memorandum / memo |

**Recommendation:** Pick one. Options:
- **便利貼** — most common in Taiwan for physical sticky notes; use everywhere for stickies app.
- **便條紙** — also common; if chosen, use for app name and all “note”/“sticky” strings.
- **備忘錄** — better for “memo”/notepad; avoid for sticky-note UI to avoid mixing with 便利貼/便條紙.

**Suggested standard:** **便利貼** for all Stickies app strings (including app name/title and menu.newNote / menu.note / placeholder). If keeping 便條紙 as the app name, at minimum align menu and placeholder to one of 便利貼 or 便條紙, not 備忘錄.

---

### ja (Japanese) — **3 terms**

| Key / context | Current translation | Term |
|---------------|---------------------|------|
| `name`, `title` | スティッキーズ | **スティッキーズ** (sutikkīzu) — “Stickies” |
| `empty.title`, `help.createNote.description` (partial) | 付箋 | **付箋** (fusen) — sticky note |
| Most other strings | メモ | **メモ** (memo) — memo |
| `menu.newNote`, `menu.note`, `placeholder` | ノート | **ノート** (nōto) — note |

**Recommendation:** Choose one for the “sticky note” concept:
- **付箋** — standard for physical sticky notes in Japan.
- **メモ** — generic memo; fine if the product is “memo” rather than “sticky”.
- **ノート** — “note”; overlaps with “notebook” and Synth “note” (音符), so can be confusing.

**Suggested standard:** Use **付箋** for the Stickies app (or **メモ** if you prefer a memo angle). Use the same term in menu.newNote, menu.note, placeholder, empty, and help so 付箋/メモ/ノート are not mixed.

---

### ko (Korean) — **2 terms**

| Key / context | Current translation | Term |
|---------------|---------------------|------|
| `name`, `title`, `description`, `empty.title`, `help.createNote.description` | 스티커 메모 | **스티커 메모** (sticker memo) |
| Other strings (menu, placeholder, help texts) | 메모 | **메모** (memo) |

**Recommendation:** Use **스티커 메모** for app name/title and **메모** for in-app actions/text is already reasonable. Optionally use **메모** everywhere for simplicity, or **스티커 메모** everywhere if you want to stress “sticky” — just avoid randomly switching between the two in the same screen.

---

## 2. Other concepts to audit (future work)

- **File / 檔案 / ファイル:** Check that “file” (document) is one term and “File” (menu) is consistent.
- **Close / 關閉 / 閉じる:** Confirm one verb/form for “close” across dialogs, menus, and buttons.
- **Note (music):** In Synth, “note” = 音符 (zh), ノート (ja) vs メモ (memo) — ensure “Note” in Stickies is never translated with the “music note” term.
- **Share / 分享:** Same root term for “share” in all share-related UI.

---

## 3. How to use this survey

1. **Decide canonical terms** per language (e.g. zh-TW: 便利貼 for stickies; ja: 付箋 or メモ).
2. **Replace all variants** in that locale so the same concept uses one term.
3. **Re-run this survey** after changes (e.g. grep for 便利貼 / 備忘錄 / 便條紙 in zh-TW) to confirm no leftover mix.
4. **Document** the canonical list in this file or in `src/lib/locales/README.md` so future translators reuse the same terms.

---

## 4. Applied standards (canonical terms)

**zh-TW Stickies:** **便利貼** for all Stickies strings (name, title, menu, placeholder, help, empty). ✓ Applied.

**ja Stickies:** **付箋** for all in-app sticky-note strings (empty, help, menu.newNote, menu.note, placeholder). App name/title remain スティッキーズ. ✓ Applied.

**ko Stickies:** No change; current split (스티커 메모 for app name/title/description/empty.title, 메모 for menu/placeholder) is kept.

---

## 5. Quick fix for zh-TW Stickies (align to 便利貼) — DONE

To unify zh-TW on **便利貼**:

- `apps.stickies.name` → 便利貼 (or keep 便條紙 if product name is fixed)
- `apps.stickies.title` → 便利貼 (or 便條紙)
- `apps.stickies.menu.newNote` → 新增便利貼
- `apps.stickies.menu.note` → 便利貼
- `apps.stickies.placeholder` → 撰寫便利貼...

Applied. 備忘錄 and 便條紙 were removed from Stickies; all use 便利貼.

# Apple English Catalog Audit

Read-only audit of all **3,754** strings in `src/lib/locales/en/translation.json` against:

- **Apple glossaries**: 9 DMGs under `/Users/ryo/Downloads/Glossaries/` (8 mounted successfully; Korean was already mounted elsewhere and skipped in one pass — coverage numbers are from 8 locales, ~679 `.lg` files each)
- **Apple Style Guide**: `/Users/ryo/Downloads/apple-style-guide.pdf` (June 2026, 244 pages, SHA256 matches `APPLE_STYLE_GUIDE_SOURCE` in `scripts/apple-ui-terminology.ts`)
- **Repo tooling**: curated 113-term table (`scripts/apple-ui-terminology-terms.json`) extracted from glossaries via `scripts/extract-apple-terminology.py`

---

## Coverage metrics

| Metric | Count | % of 3,754 |
|--------|------:|----------:|
| **Exact match** to an Apple glossary base string | 1,338 | 35.6% |
| **Near-match — ellipsis variant** (`Save` → `Save…`) | 20 | 0.5% |
| **Near-match — case only** | ~100 | ~2.7% |
| **Apple-attributable** (exact + ellipsis-correct near) | **1,358** | **36.2%** |
| **Curated 113-term hits** (strip `…` first) | 253 | 6.7% |
| — exact to curated set | 241 | |
| — case-only near to curated set | 12 | |
| **No glossary relationship** | 2,296 | 61.2% |

**Glossary corpus**: **125,986** unique English base strings across combined locales.

**Notes on near-matches**

- The 20 ellipsis variants are **correct per ASG** (“menu commands that require further action use an ellipsis”; use `…`, not `...`). Catalog has **267** Unicode-ellipsis strings and **0** ASCII `...` strings.
- Most of the ~100 case near-matches are **not violations**: aria labels and descriptions intentionally use sentence case; Finder sort items (`by Name`, `by Date`) follow classic Finder style; retro app copy is exempt.
- The repo’s `auditTranslations()` test already enforces Sign In/Sign Out and no ASCII ellipses — those pass.

---

## Compliance summary (what’s already right)

| Area | Status |
|------|--------|
| **Sign in / Sign out** | 37 keys named `login`/`logOut` correctly render **Sign In** / **Sign Out** in values; menu items use `Sign In…` where appropriate (glossary has `Sign In…` in 7 files) |
| **Ellipses** | Unicode `…` throughout; no `...` |
| **Control-click** | Used correctly in Finder AirDrop help, Minesweeper, Winamp skins |
| **backup / back up** | Noun/adj. `Backup` and verb `back up` used correctly in Control Panels copy |
| **Relaunch** | Matches Apple glossary (`Dock.lg`, `loginwindow.lg`) — **not** an ASG violation despite general “avoid launch” guidance |
| **Retro product terminology** | Internet Explorer, Classic Mac OS, Windows releases, iPod, `File ▸`, double-click, Winamp — intentionally non-Apple-modern |
| **Control Panels vs Settings** | ryOS retro naming; `Control Panels` is not in glossaries; `Settings` submenu labels are deliberate |

---

## Style violations by category

Counts are **high-confidence user-visible English issues** only (excluding intentional retro and key-name vs value mismatches).

| Category | Count | Severity |
|----------|------:|----------|
| Inclusive language (`master`) | 1 | High |
| Account terminology (`login` noun, `log out` verb) | 2 | High (Terminal — see retro note) |
| Glossary casing (`Signed In`, `go up`, `repeat all/one`) | 6 | High |
| Color label inconsistency (`yellow` vs `Yellow`) | 4 | Medium |
| `internet` capitalization (2024+ ASG) | 2 | Medium |
| `Tap` in Mac-oriented help | 5 | Low (cross-platform touch copy) |
| `Please` in instructional text | 15 | Low (ASG prefers omission) |
| `cannot` vs `can't` | 16 | Low |
| `enable` vs `turn on` | 2 | Low |
| `Username` vs `user name` | 18 | Low / mixed (Apple now favors **Apple Account**) |
| Forbidden terms (whitelist/blacklist/sanity) | 0 | — |

---

## High-confidence English corrections

### Tier 1 — clear ASG / glossary fixes

| Key | Current | Recommended | Rule / evidence |
|-----|---------|-------------|-----------------|
| `apps.control-panels.masterVolume` | `Master Volume` | `Main Volume` | ASG June 2026: avoid **master**; use **main** |
| `apps.chats.tokenStatus.authenticated` | `Signed in` | `Signed In` | Glossary: `Signed In` (`Winterpeg.lg`, `Winterpeg_iosmac.lg`, `Winterpeg_swift.lg`) — UI status label |
| `apps.finder.menu.goUp` | `Go Up` | `go up` | Glossary: `go up` (`AppKit.lg`) |
| `apps.ipod.menu.repeatAll` | `Repeat All` | `repeat all` | Glossary: `repeat all` (`MusicDesktop.lg`, `TVDesktop.lg`) |
| `apps.ipod.menu.repeatOne` | `Repeat One` | `repeat one` | Glossary: `repeat one` (`MusicDesktop.lg`) |
| `apps.videos.menu.repeatAll` | `Repeat All` | `repeat all` | Same as above |
| `apps.videos.menu.repeatOne` | `Repeat One` | `repeat one` | Same as above |
| `apps.karaoke.menu.repeatAll` | `Repeat All` | `repeat all` | Same as above |
| `apps.karaoke.menu.repeatOne` | `Repeat One` | `repeat one` | Same as above |

### Tier 2 — account terminology (Terminal context)

| Key | Current | Recommended | Rule / evidence |
|-----|---------|-------------|-----------------|
| `apps.terminal.output.lastLogin` | `last login: {{time}}` | `last sign-in: {{time}}` | ASG: **sign-in** (n./adj.); avoid **login** in user materials |
| `apps.terminal.commands.logout` | `Log out current user` | `Sign out current user` | ASG: **sign out** for accounts/services; **log out** for file servers |

**Retro caveat**: Terminal describes a `logout` command in a Unix-style shell. Keeping **log out** is defensible as intentional retro/Unix terminology (glossary also contains `Log Out` in `loginwindow.lg`). Tier 2 items are ASG-pure but lower priority if Terminal authenticity matters.

### Tier 3 — medium confidence (2024+ `internet` rule)

| Key | Current | Recommended | Rule / evidence |
|-----|---------|-------------|-----------------|
| `apps.control-panels.sections.internetNetwork` | `Internet & Network` | `internet & Network` | ASG (2024+): **internet** lowercase except product names |
| `apps.finder.fileTypes.internetShortcut` | `Internet Shortcut` | `internet Shortcut` | Same |

**Caveat**: UI section titles often retain title case; Apple’s lowercase rule targets running text. Review UI design intent before changing.

### Tier 4 — internal inconsistency (not strictly ASG)

| Key | Current | Recommended | Rule / evidence |
|-----|---------|-------------|-----------------|
| `common.colors.yellow` | `yellow` | `Yellow` | Same semantic domain uses `Yellow` in `apps.control-panels.accentColors.yellow`, `apps.stickies.colors.yellow` |
| `common.colors.blue` | `blue` | `Blue` | Same pattern |
| `common.colors.green` | `green` | `Green` | Same pattern |
| `common.colors.pink` | `pink` | `Pink` | Same pattern |

Glossary contains both `Yellow` and `yellow` in different contexts; within ryOS, accent/UI pickers use title case.

---

## Items reviewed and explicitly **not** flagged

| String / pattern | Reason |
|------------------|--------|
| `common.errorBoundaries.relaunch` / `Relaunch` | Glossary term (`Dock.lg`) |
| All **Internet Explorer** strings | Retro app name |
| **Classic Mac OS**, **Windows 95/98/XP**, **Start menu** | Retro emulation |
| **iPod** throughout | Retro product |
| `apps.chats.toolCalls.infiniteMac.rightClicked` | Describes emulated Windows input, not Mac UI |
| `common.menu.settings` → `Settings` | Valid glossary term (127 files); ryOS Control Panels app is separate |
| `Signed in to ryOS`, `Signed in as {{username}}` | Running prose — sentence case is appropriate |
| `debug.logRate` / `Log activity` | **log** as logging verb, not authentication |
| Key names `login`, `logOut`, `pleaseLogin*` | i18n identifiers; values already use Sign In/Out |

---

## Near-match glossary case samples (review only)

These differ from glossary casing but are often intentional:

- **Aria / accessibility** (sentence case): `Clear search`, `Copy message`, `Scroll to bottom`
- **Finder sort** (classic style): `by Name`, `by Date`, `by Size` — not in Finder `.lg`; `By Name` appears in `Photos_Apps.lg` only
- **Custom ryOS strings** that happen to overlap: `No results found` vs glossary `No Results Found`

---

## Category spot-checks

| Check | Result |
|-------|--------|
| ASCII ellipsis `...` | **0** — compliant |
| Unicode ellipsis `…` | **267** strings |
| `sign in` / `sign out` in values | **Dominant**; only Terminal uses log in/out |
| `launch` / `Relaunch` | 2 strings; **Relaunch** is glossary-backed |
| Control-click vs right-click | 4 Control-click; 1 right-click (emulation tool output) |
| backup/back up | 24 strings; forms used correctly |
| Menu ellipsis on `Save`, `New Folder…`, `Sign In…` | Consistent with ASG |
| Inclusive forbidden terms | None found |
| Product names (YouTube, GitHub, Apple Music) | Correctly cased |

---

## Bottom line

- **Exact Apple glossary coverage**: **1,338 / 3,754 (35.6%)**
- **Near-match count**: **~120** (~20 ellipsis-correct, ~100 case variants)
- **Apple-attributable coverage**: **1,358 (36.2%)**
- **Curated 113-term coverage**: **253 strings**
- **High-confidence corrections**: **9 definite** (Tier 1) + **2 Terminal** (Tier 2, retro-debatable) + **2 internet** (Tier 3, medium) + **4 color** (Tier 4, internal consistency)

The catalog is in strong shape for a retro OS simulation: account verbs, ellipses, Control-click, and backup terminology align with Apple norms. The meaningful gaps are a handful of glossary casing mismatches (repeat modes, Go Up, Signed In status), one inclusive-language term (Master Volume), and Terminal’s Unix-flavored login/logout wording.

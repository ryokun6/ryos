# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## June 2026

- add native toasts and shader gating
- mirror player visuals in lyrics wallpaper
- use Castlabs Electron for Apple Music DRM playback

<details>
<summary>Minor changes (10)</summary>

- release desktop v1.0.7
- test: fix always-pass, mislabeled, and weak-assertion tests from audit (#1539)
- batch metadata cache listing
- Complete Redis key-scheme migration (canonical-only runtime) (#1536)
- consistent accent-derived selection color for menus & selected items (#1535)
- release desktop v1.0.6
- bundle main/preload for Node 24
- pass EVS --no-ask as top-level vmp flag
- install castlabs-evs in venv on Electron build runners
- perf: throttle shader backgrounds on mobile (desktop wallpaper + iPod/Karaoke) (#1533)

</details>

## May 2026

- Cover Flow on fullscreen long-press (#1344)
- add Apple menu toggle for browser fullscreen ryOS shell (#1338)

<details>
<summary>Minor changes (10)</summary>

- eliminate duplicate-key empty dock slots (repro in Safari) (#1358)
- prevent empty/broken dock slots from stale or unrenderable entries (#1356)
- perf(pwa): curated Workbox precache + network-aware prefetch + offline fixes (#1348)
- subdued dark-mode shimmer on tool call loading states (#1350)
- Style Cursor agent chat cards like Maps with pinstripes (#1351)
- dark-theme lyrics search dialog to match song search (#1352)
- refactor(ipod,karaoke): unify duplicated media app code paths (#1347)
- refactor: split large React components into focused modules (#1342)
- align submenu trigger font size with menu items (#1340)
- fullscreen on documentElement so menubar portals stay visible (#1339)

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-06-19*

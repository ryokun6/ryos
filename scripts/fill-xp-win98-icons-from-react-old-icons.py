#!/usr/bin/env python3
"""
Fill missing Windows XP / Windows 98 theme icons under public/icons/{xp,win98}.

Source PNGs: https://github.com/gsnoopy/react-old-icons (MIT License).
Those PNGs use huge canvases with lots of transparent padding; we crop to the
non-transparent bounds, then uniformly scale: **Windows XP** uses smooth
(Lanczos) downsampling to **48×48**; **default** / **win98** use nearest-neighbor for crisp
pixels.

Mac-specific subtrees (control-panels, macpaint, text-editor) and bomb.svg are
copied from public/icons/default so layout stays correct.

XP `infinite-mac.png` is derived from `macosx/infinite-mac.png` (downscaled to the
same XP icon box, 48×48).

Also writes karaoke.png and paint.png into default / xp / win98. **Chats**
writes **default** / **win98** `chats.png` from **MSNMessenger** (32×32), **xp**
from **WindowsMessenger** (48×48). **system7/chats.png** is a copy of
**default/question.png**; **macosx/chats.png** is **macosx/question.png** scaled to
300×300 dock size. **question.png** stays for help/unknown UI.

Regenerate the manifest after running:
  bun run scripts/generate-icon-manifest.ts
"""

from __future__ import annotations

import io
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
DEFAULT = ICONS / "default"
# Downscale: XP stays soft (Luna); other themes use hard pixels.
ICON_DOWNSCALE = Image.Resampling.NEAREST
XP_DOWNSCALE = Image.Resampling.LANCZOS
RAW_BASE = "https://raw.githubusercontent.com/gsnoopy/react-old-icons/main/PNG/"


def resample_for_theme(theme: str) -> Image.Resampling:
    return XP_DOWNSCALE if theme == "xp" else ICON_DOWNSCALE


# (xp_source, win98_source) — PNG file names in react-old-icons (same assets as
# <ComponentName size={32} /> in the npm package). Win98 picks are tuned for 9x.
REACT_OLD_MAP: dict[str, tuple[str, str]] = {
    "account-login.png": ("MSNMessenger.png", "MSNMessenger.png"),
    # Win98: classic Control Panel look (not XP Administrative Tools / installer shield).
    "admin.png": ("AdministrativeToolsXP.png", "Windows31ControlPanel.png"),
    "applet.png": ("ComponentServices.png", "ComponentServices.png"),
    "calendar.png": ("WindowsXPDateAndTime.png", "WindowsClipbook.png"),  # DateAndTime (xp) / Clipbook (98)
    "candybar.png": ("WindowsXPWindowsCatalog.png", "ThreeThousandIcons3.png"),
    "cloud-sync.png": ("FilesTransferWizard.png", "FilesTransferWizard.png"),
    "cola.png": ("PepsiThemeMyComputer.png", "PepsiThemeMyComputer.png"),
    "contacts.png": ("WindowsXPAddressBook.png", "WindowsAddressBook.png"),
    "dashboard.png": ("WindowsXPFavorite.png", "Windows31Clock.png"),  # XPFavorite / 31 clock (98)
    "floppy.png": ("FloppyDriveXP.png", "FloppyDisk.png"),
    "gameboy.png": ("GameCube.png", "GameCube.png"),
    "internet.png": ("InternetExplorer6.png", "InternetExplorer6.png"),
    "isync.png": ("PortableMusicPlayer.png", "PortableMusicPlayer.png"),
    "music.png": ("PortableMediaPlayer.png", "PortableMediaPlayer.png"),
    "piano.png": ("MusicalInstruments.png", "MusicalInstruments.png"),
    "site.png": ("MsnExplorer.png", "MsnExplorer.png"),
    "slideshow.png": ("PowerPointXP.png", "PowerPoint.png"),
    "soundboard.png": ("WindowsXPAudioCD.png", "CreativeMixer.png"),
    "stickies.png": ("WindowsXPTextFile.png", "VisualStudioNote02.png"),
}

# Win98-only files (xp already has these in-tree). Maps to react-old-icons PNG
# names (same as <WindowsMediaPlayer2 /> etc. in the npm package).
WIN98_EXTRA: dict[str, str] = {
    "ipod.png": "WindowsMediaPlayer2.png",
}

THEME_BOX: dict[str, tuple[int, int]] = {
    "xp": (48, 48),
    "win98": (32, 32),
}

# Karaoke + paint: default + Windows themes. (Chats uses CHATS_ICON_IMPORT_THEMES.)
APP_ICON_IMPORT_THEMES: tuple[tuple[str, tuple[int, int]], ...] = (
    ("default", (32, 32)),
    ("xp", (48, 48)),
    ("win98", (32, 32)),
)

# Chats: default + win98 + xp from react-old-icons (see sync_chats_from_question_png).
CHATS_ICON_IMPORT_THEMES: tuple[tuple[str, tuple[int, int], str, Image.Resampling], ...] = (
    ("default", (32, 32), "MSNMessenger.png", ICON_DOWNSCALE),
    ("xp", (48, 48), "WindowsMessenger.png", XP_DOWNSCALE),
    ("win98", (32, 32), "MSNMessenger.png", ICON_DOWNSCALE),
)

MACOSX_DOCK_ICON: tuple[int, int] = (300, 300)


def fetch_png(name: str) -> Image.Image:
    url = RAW_BASE + name
    req = urllib.request.Request(url, headers={"User-Agent": "ryos-icon-import/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    im = Image.open(io.BytesIO(data))
    return im.convert("RGBA")


def fit_rgba_into_box(
    im: Image.Image,
    box: tuple[int, int],
    *,
    resample: Image.Resampling = ICON_DOWNSCALE,
) -> Image.Image:
    """Crop empty margins, then scale uniformly to fit inside box (centered)."""
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    tw, th = box
    if im.width < 1 or im.height < 1:
        return Image.new("RGBA", box, (0, 0, 0, 0))
    scale = min(tw / im.width, th / im.height)
    nw = max(1, int(round(im.width * scale)))
    nh = max(1, int(round(im.height * scale)))
    resized = im.resize((nw, nh), resample)
    out = Image.new("RGBA", box, (0, 0, 0, 0))
    out.paste(resized, ((tw - nw) // 2, (th - nh) // 2), resized)
    return out


def write_themed_png(
    im: Image.Image,
    dest: Path,
    box: tuple[int, int],
    *,
    resample: Image.Resampling = ICON_DOWNSCALE,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    fit_rgba_into_box(im, box, resample=resample).save(dest, "PNG")


def import_react_icon(theme: str, dest_rel: str, src_file: str) -> None:
    try:
        im = fetch_png(src_file)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} fetching {src_file!r} for {dest_rel}") from e
    write_themed_png(
        im,
        ICONS / theme / dest_rel,
        THEME_BOX[theme],
        resample=resample_for_theme(theme),
    )
    print(f"  [react-old-icons] {theme}/{dest_rel} <= {src_file}")


def import_xp_applets_store_icon() -> None:
    """XP Applet Store / applets.png: <WindowsXPShell32Icon244 /> (win98 unchanged)."""
    try:
        im = fetch_png("WindowsXPShell32Icon244.png")
    except urllib.error.HTTPError as e:
        raise SystemExit(
            f"HTTP {e.code} fetching WindowsXPShell32Icon244.png for xp/applets.png"
        ) from e
    write_themed_png(
        im,
        ICONS / "xp" / "applets.png",
        THEME_BOX["xp"],
        resample=resample_for_theme("xp"),
    )
    print("  [xp] applets.png <= WindowsXPShell32Icon244.png")


def minesweeper_app_icons() -> None:
    """XP: Luna-era Minesweeper. Win98: prefer native theme mine when present."""
    import_react_icon("xp", "minesweeper-app.png", "MinesweeperXP.png")
    src = ICONS / "win98" / "minesweeper.png"
    dest = ICONS / "win98" / "minesweeper-app.png"
    if src.is_file():
        shutil.copy2(src, dest)
        print("  [win98] minesweeper-app.png <= minesweeper.png (native theme)")
    else:
        import_react_icon("win98", "minesweeper-app.png", "Minesweeper.png")


def copy_tree_from_default(sub: str) -> None:
    """Copy relative file tree from default into xp + win98 if missing."""
    src_root = DEFAULT / sub
    if not src_root.exists():
        return
    for path in sorted(src_root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(DEFAULT).as_posix()
        for theme in ("xp", "win98"):
            dest = ICONS / theme / rel
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
            print(f"  [default] {theme}/{rel}")


def copy_default_named(files: list[str]) -> None:
    for name in files:
        src = DEFAULT / name
        if not src.is_file():
            continue
        for theme in ("xp", "win98"):
            dest = ICONS / theme / name
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            if name.endswith(".png"):
                im = Image.open(src).convert("RGBA")
                write_themed_png(
                    im, dest, THEME_BOX[theme], resample=resample_for_theme(theme)
                )
            else:
                shutil.copy2(src, dest)
            print(f"  [default] {theme}/{name}")


def win98_folder_from_directory() -> None:
    d = ICONS / "win98" / "directory.png"
    f = ICONS / "win98" / "folder.png"
    if f.exists():
        return
    if not d.is_file():
        return
    shutil.copy2(d, f)
    print("  [dup] win98/folder.png <= win98/directory.png")


def win98_ie_site_from_xp() -> None:
    src = ICONS / "xp" / "ie-site.png"
    dest = ICONS / "win98" / "ie-site.png"
    if not src.is_file():
        return
    im = Image.open(src).convert("RGBA")
    write_themed_png(im, dest, THEME_BOX["win98"], resample=resample_for_theme("win98"))
    print("  [xp->win98] win98/ie-site.png")


def import_chats_icon() -> None:
    """Chats: MSNMessenger on default + win98; WindowsMessenger on xp (react-old-icons)."""
    for theme, box, src_file, resample in CHATS_ICON_IMPORT_THEMES:
        try:
            im = fetch_png(src_file)
        except urllib.error.HTTPError as e:
            raise SystemExit(
                f"HTTP {e.code} fetching {src_file!r} for {theme}/chats.png"
            ) from e
        dest = ICONS / theme / "chats.png"
        write_themed_png(im, dest, box, resample=resample)
        print(f"  [chats] {theme}/chats.png <= {src_file} ({box[0]}×{box[1]})")


def sync_chats_from_question_png() -> None:
    """system7 + macosx Chats: same artwork as question.png (avoids missing /icons/system7/chats)."""
    s7 = ICONS / "system7"
    s7.mkdir(parents=True, exist_ok=True)
    q_default = DEFAULT / "question.png"
    if not q_default.is_file():
        raise SystemExit("missing public/icons/default/question.png for system7/chats.png")
    shutil.copy2(q_default, s7 / "chats.png")
    print("  [chats] system7/chats.png <= default/question.png (copy)")

    q_mac = ICONS / "macosx" / "question.png"
    if not q_mac.is_file():
        raise SystemExit("missing public/icons/macosx/question.png for macosx/chats.png")
    im = Image.open(q_mac).convert("RGBA")
    dest = ICONS / "macosx" / "chats.png"
    write_themed_png(im, dest, MACOSX_DOCK_ICON, resample=XP_DOWNSCALE)
    print(f"  [chats] macosx/chats.png <= macosx/question.png ({MACOSX_DOCK_ICON[0]}×{MACOSX_DOCK_ICON[1]})")


def import_karaoke_icon() -> None:
    """Karaoke app: react-old-icons Windows31Sound (<Windows31Sound size={32} />)."""
    try:
        im = fetch_png("Windows31Sound.png")
    except urllib.error.HTTPError as e:
        raise SystemExit(
            f"HTTP {e.code} fetching Windows31Sound.png for karaoke.png"
        ) from e
    for theme, box in APP_ICON_IMPORT_THEMES:
        dest = ICONS / theme / "karaoke.png"
        write_themed_png(im, dest, box, resample=resample_for_theme(theme))
        print(
            f"  [karaoke] {theme}/karaoke.png <= Windows31Sound.png ({box[0]}×{box[1]})"
        )


def import_paint_icon() -> None:
    """Paint: <WindowsXPPaint /> on xp; <Windows98Paint /> on default and win98."""
    src_by_theme: dict[str, str] = {
        "xp": "WindowsXPPaint.png",
        "default": "Windows98Paint.png",
        "win98": "Windows98Paint.png",
    }
    for theme, box in APP_ICON_IMPORT_THEMES:
        src_file = src_by_theme[theme]
        try:
            im = fetch_png(src_file)
        except urllib.error.HTTPError as e:
            raise SystemExit(
                f"HTTP {e.code} fetching {src_file!r} for {theme}/paint.png"
            ) from e
        dest = ICONS / theme / "paint.png"
        write_themed_png(im, dest, box, resample=resample_for_theme(theme))
        print(f"  [paint] {theme}/paint.png <= {src_file} ({box[0]}×{box[1]})")


def import_xp_infinite_mac_from_macosx() -> None:
    """XP infinite-mac: same artwork as macosx theme, scaled into the XP icon box (Lanczos)."""
    src = ICONS / "macosx" / "infinite-mac.png"
    if not src.is_file():
        print("  [xp/infinite-mac] skip: macosx/infinite-mac.png missing")
        return
    im = Image.open(src).convert("RGBA")
    write_themed_png(
        im,
        ICONS / "xp" / "infinite-mac.png",
        THEME_BOX["xp"],
        resample=resample_for_theme("xp"),
    )
    print("  [xp] infinite-mac.png <= macosx/infinite-mac.png")


def main() -> None:
    print("[fill-xp-win98-icons] react-old-icons imports…")
    for dest_rel, (xp_src, w98_src) in REACT_OLD_MAP.items():
        import_react_icon("xp", dest_rel, xp_src)
        import_react_icon("win98", dest_rel, w98_src)

    for dest_rel, src in WIN98_EXTRA.items():
        import_react_icon("win98", dest_rel, src)

    import_xp_applets_store_icon()
    minesweeper_app_icons()
    import_chats_icon()
    sync_chats_from_question_png()
    import_karaoke_icon()
    import_paint_icon()

    print("[fill-xp-win98-icons] Mac UI + misc from default…")
    copy_tree_from_default("control-panels")
    copy_tree_from_default("macpaint")
    copy_tree_from_default("text-editor")
    copy_default_named(["bomb.svg", "infinite-mac.png", "ie-loader.png", "ie-loader-animated.png"])

    import_xp_infinite_mac_from_macosx()

    win98_folder_from_directory()
    win98_ie_site_from_xp()
    print("[fill-xp-win98-icons] Done. Run: bun run scripts/generate-icon-manifest.ts")


if __name__ == "__main__":
    main()

# Mac OS X icon catalogs

Historical Mac OS X icon resources extracted for future ryOS asset work.

These catalogs are intentionally stored outside `public/icons` so they do not
participate in active theme icon resolution or replace existing app icons.

## Catalogs

- `panther/` - Mac OS X Panther 10.3 CD, from https://archive.org/details/mac-os-x-10.3
- `tiger/` - Mac OS X Tiger 10.4 Retail DVD, from https://archive.org/details/macosx10.4tigerretaildvd
- `lion/` - Mac OS X Lion DP4 icon pack, from https://freesoft.ru/mac-os/mac_os_x_lion_icon_pack
- `mountain-lion/` - OS X Mountain Lion 10.8 installer resources, from https://archive.org/details/macOS-X-images

The Macintosh Repository retro Mac OS/OS X pack was evaluated for Lion and
Mountain Lion assets, but the 161.1 MB archive exceeds the site's 100 MB guest
download limit. Lion and Mountain Lion catalogs therefore use public alternate
sources that were downloadable in this environment. Mountain Lion app and
System Preferences pane icons come from the installer's `Essentials.pkg`; shared
folder, device, file-type, and UI resources come from CoreTypes in the Base
System image.

Each catalog contains:

- `applications/` - converted PNGs for top-level application bundles.
- `system-preferences/` - converted PNGs for System Preferences panes.
- `ui-assets/` - converted PNGs for dialog, badge, status, and larger app UI artwork.
- `folders/` - converted PNGs for CoreServices folder icons.
- `devices/` - converted PNGs for CoreServices device, display, disk, and network icons.
- `file-types/` - converted PNGs for key system and app document/file type icons.
- `catalog.json` - machine-readable metadata with source bundle/icon paths.
- `catalog.md` - browsable table of the same entries.

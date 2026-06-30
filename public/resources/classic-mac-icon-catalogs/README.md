# Classic Mac OS icon catalogs

Classic Mac OS 7/8/9 icon resources collected for future ryOS asset work.

These catalogs are intentionally stored outside `public/icons` so they do not participate in active theme icon resolution or replace existing app icons.

## Catalogs

- `system-7/` - System 7.5.3, from https://archive.org/details/AppleMacintoshSystem753
- `mac-os-8/` - Mac OS 8.1, from https://archive.org/details/MacOS_8_Version_8.1_691-1912-A_Apple_Computer_Inc._1998
- `mac-os-9/` - Mac OS 9, from https://github.com/bearz314/MacOS9-icons

System 7 and Mac OS 8 were extracted from HFS images with resource forks preserved via `hfsutils` MacBinary export, then converted with `rsrcdump`. Coverage includes bundled applications, Apple menu items, control panels, extensions, Finder/System resources, Appearance Extension resources where present, and document/stack resources when parseable. Mac OS 9 uses the already-extracted resource-derived PNG set from `bearz314/MacOS9-icons`.

Each catalog contains:

- `applications/` - PNGs extracted from bundled applications, utilities, installers, and app extras.
- `control-panels/` - PNGs extracted from classic `cdev` control panels.
- `apple-menu-items/` - PNGs extracted from Apple Menu Items.
- `extensions/` - PNGs extracted from extensions, shared libraries, drivers, and guide resources.
- `system/` - PNGs extracted from the System suitcase resource fork.
- `finder/` - PNGs extracted from Finder resources when available.
- `appearance/` - PNGs extracted from Appearance Extension resources when available.
- `documents/` - PNGs extracted from HyperCard stacks and document-like resource files.
- `resources/` - PNGs from an external resource-derived icon set.
- `catalog.json` - machine-readable metadata with source file/resource paths.
- `catalog.md` - browsable table of the same entries.

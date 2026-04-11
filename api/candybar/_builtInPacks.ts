export interface CandyBarIconPackIcon {
  name: string;
  url: string;
}

export interface CandyBarIconPack {
  id: string;
  name: string;
  author: string;
  description: string;
  previewIcons: CandyBarIconPackIcon[];
  iconCount: number;
  downloadUrl?: string;
  createdAt: string;
  category: string;
}

const PACK_ASSET_ROOT = "/candybar/icon-packs";

function previewIcons(
  folder: string,
  icons: Array<{ name: string; file: string }>
): CandyBarIconPackIcon[] {
  return icons.map(({ name, file }) => ({
    name,
    url: `${PACK_ASSET_ROOT}/${folder}/${file}`,
  }));
}

export function getBuiltInCandyBarPacks(): CandyBarIconPack[] {
  return [
    {
      id: "ryos-default",
      name: "System 7",
      author: "Ryo Lu",
      description:
        "The default icon set for ryOS. Classic System 7 style-clean, black and white, and familiar.",
      previewIcons: [
        { name: "Finder", url: "/icons/default/mac.png" },
        { name: "TextEdit", url: "/icons/default/textedit.png" },
        { name: "Terminal", url: "/icons/default/terminal.png" },
        { name: "Paint", url: "/icons/default/paint.png" },
        { name: "Photo Booth", url: "/icons/default/photo-booth.png" },
        { name: "Internet Explorer", url: "/icons/default/ie.png" },
        { name: "Videos", url: "/icons/default/videos.png" },
        { name: "Soundboard", url: "/icons/default/soundboard.png" },
        { name: "Synth", url: "/icons/default/synth.png" },
      ],
      iconCount: 9,
      createdAt: "2025-01-01T00:00:00Z",
      category: "system",
    },
    {
      id: "ryos-macosx",
      name: "Aqua",
      author: "Ryo Lu",
      description:
        "Icons inspired by the macOS Aqua theme with glossy effects and vibrant colors.",
      previewIcons: [
        { name: "Finder", url: "/icons/macosx/mac.png" },
        { name: "TextEdit", url: "/icons/macosx/textedit.png" },
        { name: "Terminal", url: "/icons/macosx/terminal.png" },
        { name: "iPod", url: "/icons/macosx/ipod.png" },
        { name: "Paint", url: "/icons/macosx/paint.png" },
        { name: "Photo Booth", url: "/icons/macosx/photo-booth.png" },
        { name: "Internet Explorer", url: "/icons/macosx/ie.png" },
        { name: "Videos", url: "/icons/macosx/videos.png" },
        { name: "Soundboard", url: "/icons/macosx/soundboard.png" },
        { name: "Synth", url: "/icons/macosx/synth.png" },
        { name: "Contacts", url: "/icons/macosx/contacts.png" },
        { name: "Dashboard", url: "/icons/macosx/dashboard.png" },
      ],
      iconCount: 12,
      createdAt: "2025-01-15T00:00:00Z",
      category: "system",
    },
    {
      id: "ryos-xp",
      name: "Luna",
      author: "Ryo Lu",
      description:
        "Colorful icons from the Windows XP Luna theme with soft shadows.",
      previewIcons: [
        { name: "Finder", url: "/icons/xp/mac.png" },
        { name: "TextEdit", url: "/icons/xp/textedit.png" },
        { name: "Terminal", url: "/icons/xp/terminal.png" },
        { name: "iPod", url: "/icons/xp/ipod.png" },
        { name: "Paint", url: "/icons/xp/paint.png" },
        { name: "Photo Booth", url: "/icons/xp/photo-booth.png" },
        { name: "Internet Explorer", url: "/icons/xp/ie.png" },
        { name: "Videos", url: "/icons/xp/videos.png" },
        { name: "Synth", url: "/icons/xp/synth.png" },
        { name: "Winamp", url: "/icons/xp/winamp.png" },
      ],
      iconCount: 10,
      createdAt: "2025-02-15T00:00:00Z",
      category: "system",
    },
    {
      id: "ryos-win98",
      name: "98",
      author: "Ryo Lu",
      description:
        "Retro 16-color icons from the Windows 98 era with beveled edges.",
      previewIcons: [
        { name: "Finder", url: "/icons/win98/mac.png" },
        { name: "TextEdit", url: "/icons/win98/textedit.png" },
        { name: "Terminal", url: "/icons/win98/terminal.png" },
        { name: "Paint", url: "/icons/win98/paint.png" },
        { name: "Photo Booth", url: "/icons/win98/photo-booth.png" },
        { name: "Internet Explorer", url: "/icons/win98/ie.png" },
        { name: "Videos", url: "/icons/win98/videos.png" },
        { name: "Synth", url: "/icons/win98/synth.png" },
        { name: "Winamp", url: "/icons/win98/winamp.png" },
      ],
      iconCount: 9,
      createdAt: "2025-03-01T00:00:00Z",
      category: "system",
    },
    {
      id: "internet-win98-defaults",
      name: "Windows 98 Defaults",
      author: "trapd00r",
      description:
        "Curated from trapd00r's archive of original Windows 95, 98, 2000, and XP icons, focused on the most recognizable Windows 98 desktop staples.",
      previewIcons: previewIcons("win98", [
        { name: "My Computer", file: "computer.ico" },
        { name: "Document", file: "document.ico" },
        { name: "Downloads", file: "download.ico" },
        { name: "Desktop", file: "desktop.ico" },
        { name: "Hard Disk", file: "hard-disk-drive.ico" },
        { name: "Explorer", file: "explorer.ico" },
        { name: "Recycle Bin Empty", file: "recycle-bin-empty.ico" },
        { name: "Recycle Bin Full", file: "recycle-bin-full.ico" },
      ]),
      iconCount: 8,
      downloadUrl: "https://github.com/trapd00r/win95-winxp_icons",
      createdAt: "2026-04-05T00:00:00Z",
      category: "system",
    },
    {
      id: "internet-windows-xp-luna",
      name: "Windows XP Luna",
      author: "B00merang Project",
      description:
        "Curated from the WinXP-Icons remake with named Luna-style folders, drives, trash, and browser assets that unpack cleanly on Linux.",
      previewIcons: previewIcons("xp", [
        { name: "My Computer", file: "computer.png" },
        { name: "My Documents", file: "folder-documents.png" },
        { name: "Downloads", file: "folder-downloads.png" },
        { name: "Trash Empty", file: "trash-empty.png" },
        { name: "Trash Full", file: "trash-full.png" },
        { name: "Hard Disk", file: "drive-harddisk.png" },
        { name: "Printer", file: "printer.png" },
        { name: "Help Browser", file: "help-browser.png" },
      ]),
      iconCount: 8,
      downloadUrl: "https://github.com/B00merang-Project/WinXP-Icons",
      createdAt: "2026-04-05T00:00:00Z",
      category: "system",
    },
    {
      id: "internet-macosx-aqua",
      name: "Mac OS X Aqua",
      author: "B00merang Artwork",
      description:
        "Curated from a Linux-friendly Aqua icon theme and chosen to match the glossy Tiger and Leopard-era desktop feel as closely as possible.",
      previewIcons: previewIcons("macosx-aqua", [
        { name: "Computer", file: "computer.png" },
        { name: "TextEdit", file: "text-edit.png" },
        { name: "Address Book", file: "address-book.png" },
        { name: "Documents", file: "folder-documents.png" },
        { name: "Downloads", file: "folder-downloads.png" },
        { name: "Trash Empty", file: "trash-empty.png" },
        { name: "Hard Disk", file: "drive-harddisk.png" },
        { name: "Camera", file: "camera.png" },
      ]),
      iconCount: 8,
      downloadUrl: "https://github.com/B00merang-Artwork/Mac-OS-X-Lion",
      createdAt: "2026-04-05T00:00:00Z",
      category: "system",
    },
    {
      id: "internet-classic-mac-os",
      name: "Classic Mac OS 7/8/9",
      author: "Macintosh Repository community",
      description:
        "Curated from a downloadable Mac OS 9 icon theme, with Finder, folders, drives, and documents that map well to the broader System 7, Mac OS 8, and Mac OS 9 look.",
      previewIcons: previewIcons("classic-mac-os", [
        { name: "Finder", file: "finder.png" },
        { name: "Documents", file: "documents.png" },
        { name: "Downloads", file: "downloads.png" },
        { name: "Desktop", file: "desktop.png" },
        { name: "Drive", file: "drive.png" },
        { name: "Reference", file: "reference.png" },
        { name: "Folder", file: "folder.png" },
        { name: "Games", file: "games.png" },
      ]),
      iconCount: 8,
      downloadUrl: "https://macintoshrepository.org/67447-macos-9-icon-theme-for-macos-x",
      createdAt: "2026-04-05T00:00:00Z",
      category: "system",
    },
    {
      id: "folders-aqua",
      name: "Aqua Folders",
      author: "Ryo Lu",
      description: "Glossy folder icons in the macOS Aqua style.",
      previewIcons: [
        { name: "Documents", url: "/icons/macosx/documents.png" },
        { name: "Applets", url: "/icons/macosx/applets.png" },
        { name: "Trash Empty", url: "/icons/macosx/trash-empty.png" },
        { name: "Trash Full", url: "/icons/macosx/trash-full.png" },
        { name: "Applications", url: "/icons/macosx/applications.png" },
        { name: "Directory", url: "/icons/macosx/directory.png" },
        { name: "Desktop", url: "/icons/macosx/desktop.png" },
        { name: "Downloads", url: "/icons/macosx/downloads.png" },
      ],
      iconCount: 8,
      createdAt: "2025-03-15T00:00:00Z",
      category: "folders",
    },
    {
      id: "folders-default",
      name: "Classic Folders",
      author: "Ryo Lu",
      description: "The default ryOS folder icon set with a clean vintage look.",
      previewIcons: [
        { name: "Documents", url: "/icons/default/documents.png" },
        { name: "Applets", url: "/icons/default/applets.png" },
        { name: "Trash Empty", url: "/icons/default/trash-empty.png" },
        { name: "Trash Full", url: "/icons/default/trash-full.png" },
        { name: "Applications", url: "/icons/default/applications.png" },
        { name: "Directory", url: "/icons/default/directory.png" },
        { name: "Desktop", url: "/icons/default/desktop.png" },
        { name: "Downloads", url: "/icons/default/downloads.png" },
      ],
      iconCount: 8,
      createdAt: "2025-03-20T00:00:00Z",
      category: "folders",
    },
    {
      id: "devices-collection",
      name: "Devices",
      author: "Ryo Lu",
      description:
        "Hardware device icons including monitors, drives, and peripherals.",
      previewIcons: [
        { name: "Virtual PC", url: "/icons/default/pc.png" },
        { name: "iPod", url: "/icons/default/ipod.png" },
        { name: "Synth", url: "/icons/default/synth.png" },
        { name: "Disk", url: "/icons/macosx/disk.png" },
        { name: "CD-ROM", url: "/icons/macosx/cdrom.png" },
        { name: "Mac Classic", url: "/icons/default/mac-classic.png" },
      ],
      iconCount: 6,
      createdAt: "2025-04-01T00:00:00Z",
      category: "devices",
    },
    {
      id: "apps-productivity",
      name: "Productivity Suite",
      author: "Ryo Lu",
      description:
        "Application icons for productivity tools - editors, browsers, and utilities.",
      previewIcons: [
        { name: "TextEdit", url: "/icons/default/textedit.png" },
        { name: "Internet Explorer", url: "/icons/default/ie.png" },
        { name: "Terminal", url: "/icons/default/terminal.png" },
        { name: "Paint", url: "/icons/default/paint.png" },
        { name: "Calendar", url: "/icons/default/calendar.png" },
        { name: "Contacts", url: "/icons/default/contacts.png" },
        { name: "Stickies", url: "/icons/default/stickies.png" },
        { name: "Dashboard", url: "/icons/default/dashboard.png" },
      ],
      iconCount: 8,
      createdAt: "2025-04-15T00:00:00Z",
      category: "apps",
    },
    {
      id: "apps-entertainment",
      name: "Entertainment",
      author: "Ryo Lu",
      description:
        "Icons for media and entertainment apps - music, video, and games.",
      previewIcons: [
        { name: "iPod", url: "/icons/default/ipod.png" },
        { name: "Karaoke", url: "/icons/default/karaoke.png" },
        { name: "Videos", url: "/icons/default/videos.png" },
        { name: "Soundboard", url: "/icons/default/soundboard.png" },
        { name: "Winamp", url: "/icons/default/winamp.png" },
        { name: "Minesweeper", url: "/icons/default/minesweeper-app.png" },
      ],
      iconCount: 6,
      createdAt: "2025-05-01T00:00:00Z",
      category: "apps",
    },
  ];
}

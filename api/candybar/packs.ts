/**
 * GET /api/candybar/packs - List available icon packs from blob storage.
 *
 * Returns pack metadata stored in Redis. Pack icons are stored in blob storage.
 * If no packs exist yet, returns built-in sample packs using existing ryOS icons.
 */

import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const PACKS_CACHE_KEY = "candybar:packs";
const CACHE_TTL = 300; // 5 minutes

interface IconPackIcon {
  name: string;
  url: string;
}

interface IconPack {
  id: string;
  name: string;
  author: string;
  description: string;
  previewIcons: IconPackIcon[];
  iconCount: number;
  downloadUrl?: string;
  createdAt: string;
  category: string;
}

function getBuiltInPacks(): IconPack[] {
  return [
    {
      id: "ryos-default",
      name: "System 7",
      author: "Ryo Lu",
      description: "The default icon set for ryOS. Classic System 7 style—clean, black and white, and familiar.",
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
      description: "Icons inspired by the macOS Aqua theme with glossy effects and vibrant colors.",
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
      description: "Colorful icons from the Windows XP Luna theme with soft shadows.",
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
      description: "Retro 16-color icons from the Windows 98 era with beveled edges.",
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
      description: "Hardware device icons including monitors, drives, and peripherals.",
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
      description: "Application icons for productivity tools - editors, browsers, and utilities.",
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
      description: "Icons for media and entertainment apps - music, video, and games.",
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
    {
      id: "community-win98-rdtg",
      name: "Windows 98 (Internet Pack)",
      author: "rtdg (curated for ryOS)",
      description:
        "Internet-sourced Win98 icon subset curated from Win98rdtg on WinCustomize (freeware IconPackager package).",
      previewIcons: [
        {
          name: "My Computer",
          url: "/icons/community/win98-rdtg/my-computer.png",
        },
        {
          name: "Folder (Closed)",
          url: "/icons/community/win98-rdtg/folder-closed.png",
        },
        {
          name: "Folder (Open)",
          url: "/icons/community/win98-rdtg/folder-open.png",
        },
        {
          name: "Recycle Bin (Empty)",
          url: "/icons/community/win98-rdtg/recycle-bin-empty.png",
        },
        {
          name: "Recycle Bin (Full)",
          url: "/icons/community/win98-rdtg/recycle-bin-full.png",
        },
        {
          name: "Internet Explorer",
          url: "/icons/community/win98-rdtg/internet-explorer.png",
        },
        {
          name: "Notepad",
          url: "/icons/community/win98-rdtg/notepad.png",
        },
        {
          name: "Paint",
          url: "/icons/community/win98-rdtg/paint.png",
        },
        {
          name: "Network Neighborhood",
          url: "/icons/community/win98-rdtg/network-neighborhood.png",
        },
        {
          name: "Control Panel",
          url: "/icons/community/win98-rdtg/control-panel.png",
        },
      ],
      iconCount: 10,
      downloadUrl: "https://www.wincustomize.com/explore/iconpackager/2157",
      createdAt: "2026-04-05T00:00:00Z",
      category: "community",
    },
    {
      id: "community-xp-highres-cc0",
      name: "Windows XP High-Res (CC0)",
      author: "marchmountain (curated for ryOS)",
      description:
        "Internet-sourced Windows XP icon subset curated from the Windows XP High Resolution Icon Pack 2 (CC0 1.0).",
      previewIcons: [
        {
          name: "My Computer",
          url: "/icons/community/xp-highres-cc0/my-computer.png",
        },
        {
          name: "Folder (Closed)",
          url: "/icons/community/xp-highres-cc0/folder-closed.png",
        },
        {
          name: "Folder (Open)",
          url: "/icons/community/xp-highres-cc0/folder-open.png",
        },
        {
          name: "Recycle Bin (Empty)",
          url: "/icons/community/xp-highres-cc0/recycle-bin-empty.png",
        },
        {
          name: "Recycle Bin (Full)",
          url: "/icons/community/xp-highres-cc0/recycle-bin-full.png",
        },
        {
          name: "Internet Explorer",
          url: "/icons/community/xp-highres-cc0/internet-explorer.png",
        },
        { name: "Notepad", url: "/icons/community/xp-highres-cc0/notepad.png" },
        { name: "Paint", url: "/icons/community/xp-highres-cc0/paint.png" },
        {
          name: "My Music",
          url: "/icons/community/xp-highres-cc0/my-music.png",
        },
        {
          name: "My Videos",
          url: "/icons/community/xp-highres-cc0/my-videos.png",
        },
      ],
      iconCount: 10,
      downloadUrl:
        "https://github.com/marchmountain/-Windows-XP-High-Resolution-Icon-Pack",
      createdAt: "2026-04-05T00:00:00Z",
      category: "community",
    },
    {
      id: "community-system7-macos8-9-classic",
      name: "System 7 / macOS 8-9 Classic",
      author: "danmorgandesigns (curated for ryOS)",
      description:
        "Internet-sourced classic Mac icon subset curated from classic-mac-elements (vector recreations inspired by System 1-7 and HyperCard).",
      previewIcons: [
        {
          name: "Happy Mac",
          url: "/icons/community/system7-macos8-9-classic/happy-mac.png",
        },
        {
          name: "System Folder",
          url: "/icons/community/system7-macos8-9-classic/system-folder.png",
        },
        {
          name: "Trash (Empty)",
          url: "/icons/community/system7-macos8-9-classic/trash-empty.png",
        },
        {
          name: "Trash (Full)",
          url: "/icons/community/system7-macos8-9-classic/trash-full.png",
        },
        {
          name: "Floppy Disk",
          url: "/icons/community/system7-macos8-9-classic/floppy-disk.png",
        },
        {
          name: "MacPaint",
          url: "/icons/community/system7-macos8-9-classic/macpaint.png",
        },
        {
          name: "HyperCard",
          url: "/icons/community/system7-macos8-9-classic/hypercard.png",
        },
        {
          name: "Notepad",
          url: "/icons/community/system7-macos8-9-classic/notepad.png",
        },
        {
          name: "Sound",
          url: "/icons/community/system7-macos8-9-classic/sound-icon.png",
        },
        {
          name: "Apple",
          url: "/icons/community/system7-macos8-9-classic/apple-icon.png",
        },
      ],
      iconCount: 10,
      downloadUrl: "https://github.com/danmorgandesigns/classic-mac-elements",
      createdAt: "2026-04-05T00:00:00Z",
      category: "community",
    },
    {
      id: "community-macosx-tiger-leopard-folders",
      name: "macOS X Tiger/Leopard Folders",
      author: "msikma (curated for ryOS)",
      description:
        "Internet-sourced Aqua-style folder icon subset curated from osx-folder-icons (MIT-licensed modifications, based on Apple folder artwork).",
      previewIcons: [
        {
          name: "Aqua Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/aqua-folder.png",
        },
        {
          name: "Blue Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/blue-folder.png",
        },
        {
          name: "Dark Blue Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/darkblue-folder.png",
        },
        {
          name: "Generic Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/generic-folder.png",
        },
        {
          name: "Gray Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/gray-folder.png",
        },
        {
          name: "Green Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/green-folder.png",
        },
        {
          name: "Orange Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/orange-folder.png",
        },
        {
          name: "Pink Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/pink-folder.png",
        },
        {
          name: "Red Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/red-folder.png",
        },
        {
          name: "Yellow Folder",
          url: "/icons/community/macosx-tiger-leopard-folders/yellow-folder.png",
        },
      ],
      iconCount: 10,
      downloadUrl: "https://github.com/msikma/osx-folder-icons",
      createdAt: "2026-04-05T00:00:00Z",
      category: "community",
    },
  ];
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
  },
  async ({ res, redis }): Promise<void> => {
    try {
      const cached = await redis.get(PACKS_CACHE_KEY);
      if (cached) {
        const packs: IconPack[] =
          typeof cached === "string" ? JSON.parse(cached) : (cached as IconPack[]);
        res.status(200).json({ packs });
        return;
      }
    } catch {
      // Cache miss or parse error, fall through
    }

    const packs = getBuiltInPacks();

    try {
      await redis.set(PACKS_CACHE_KEY, JSON.stringify(packs), {
        ex: CACHE_TTL,
      });
    } catch {
      // Non-critical cache write failure
    }

    res.status(200).json({ packs });
  }
);

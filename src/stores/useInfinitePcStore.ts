import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * v86 profile preset definition for Infinite PC (copy.sh/v86)
 *
 * Each preset corresponds to a `?profile=<id>` value supported by
 * https://copy.sh/v86/. See https://github.com/copy/v86 for the source list.
 *
 * The screenSize is the native VGA/SVGA framebuffer for that profile and is
 * used to auto-size the window for a 1:1 (no-letterbox) display.
 */
export interface PcPreset {
  id: string;
  name: string;
  year: string;
  /** v86 profile id (matches `?profile=` query param on copy.sh/v86) */
  profile: string;
  description: string;
  /** Optional thumbnail (defaults to a colored card if missing/errors) */
  image?: string;
  /** Native framebuffer size used for auto-resize */
  screenSize: { width: number; height: number };
  /** Solid card color when no thumbnail loads ("R,G,B") */
  rgb?: string;
}

/**
 * Curated set of v86 profiles covering iconic OSes that emulate well in browser.
 * IDs map directly to copy.sh/v86 profiles. Most presets use 640×480; Windows 1.01
 * uses 640×350; DOOM-on-a-floppy uses 320×200.
 *
 * Thumbnails (`image`) are captured by `bun run generate:infinite-pc-thumbnails`
 * and saved under `public/assets/infinite-pc-thumbnails/<id>.png`. Presets
 * without a thumbnail fall back to a solid `rgb` color card.
 */
const THUMBNAIL_BASE = "/assets/infinite-pc-thumbnails";

export const PC_PRESETS: PcPreset[] = [
  {
    id: "freedos",
    name: "FreeDOS",
    year: "1998",
    profile: "freedos",
    description: "Free, open-source DOS-compatible OS",
    screenSize: { width: 640, height: 480 },
    rgb: "30,30,30",
    image: `${THUMBNAIL_BASE}/freedos.png`,
  },
  {
    id: "msdos",
    name: "MS-DOS 6.22",
    year: "1994",
    profile: "msdos",
    description: "The classic Microsoft disk operating system",
    screenSize: { width: 640, height: 480 },
    rgb: "20,20,20",
    image: `${THUMBNAIL_BASE}/msdos.png`,
  },
  {
    id: "windows1",
    name: "Windows 1.01",
    year: "1985",
    profile: "windows1",
    description: "The very first Windows release on a floppy",
    screenSize: { width: 640, height: 350 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows1.png`,
  },
  {
    id: "windows30",
    name: "Windows 3.0",
    year: "1990",
    profile: "windows30",
    description: "Program Manager and 16-color icons",
    screenSize: { width: 640, height: 480 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows30.png`,
  },
  {
    id: "windows31",
    name: "Windows 3.1",
    year: "1992",
    profile: "windows31",
    description: "TrueType fonts and the iconic Hot Dog Stand theme",
    screenSize: { width: 640, height: 480 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows31.png`,
  },
  {
    id: "windows95",
    name: "Windows 95",
    year: "1995",
    profile: "windows95",
    description: "Start menu, taskbar, and the 32-bit revolution",
    screenSize: { width: 800, height: 600 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows95.png`,
  },
  {
    id: "windows98",
    name: "Windows 98",
    year: "1998",
    profile: "windows98",
    description: "Active Desktop, USB support, and Internet Explorer 4",
    screenSize: { width: 800, height: 600 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows98.png`,
  },
  {
    id: "windows-me",
    name: "Windows ME",
    year: "2000",
    profile: "windows-me",
    description: "Millennium Edition - the last 9x kernel",
    screenSize: { width: 800, height: 600 },
    rgb: "0,128,128",
    image: `${THUMBNAIL_BASE}/windows-me.png`,
  },
  {
    id: "windows2000",
    name: "Windows 2000",
    year: "2000",
    profile: "windows2000",
    description: "NT-based stability, professional desktop",
    screenSize: { width: 1024, height: 768 },
    rgb: "58,110,165",
    image: `${THUMBNAIL_BASE}/windows2000.png`,
  },
  {
    id: "linux26",
    name: "Linux 2.6",
    year: "2003",
    profile: "linux26",
    description: "Classic Linux kernel with BusyBox userland",
    screenSize: { width: 640, height: 480 },
    rgb: "10,10,10",
    image: `${THUMBNAIL_BASE}/linux26.png`,
  },
  {
    id: "linux4",
    name: "Linux 4.x",
    year: "2017",
    profile: "linux4",
    description: "Modern Linux kernel, headless terminal boot",
    screenSize: { width: 640, height: 480 },
    rgb: "10,10,10",
    image: `${THUMBNAIL_BASE}/linux4.png`,
  },
  {
    id: "archlinux",
    name: "Arch Linux",
    year: "2019",
    profile: "archlinux",
    description: "Rolling-release Linux with i3 window manager",
    screenSize: { width: 1024, height: 768 },
    rgb: "23,30,40",
    image: `${THUMBNAIL_BASE}/archlinux.png`,
  },
  {
    id: "dsl",
    name: "Damn Small Linux",
    year: "2006",
    profile: "dsl",
    description: "Tiny 50MB live Linux distribution",
    screenSize: { width: 800, height: 600 },
    rgb: "30,40,30",
    image: `${THUMBNAIL_BASE}/dsl.png`,
  },
  {
    id: "buildroot",
    name: "Buildroot Linux",
    year: "2014",
    profile: "buildroot",
    description: "Minimal Linux for embedded targets",
    screenSize: { width: 640, height: 480 },
    rgb: "10,10,10",
    image: `${THUMBNAIL_BASE}/buildroot.png`,
  },
  {
    id: "freebsd",
    name: "FreeBSD",
    year: "2003",
    profile: "freebsd",
    description: "BSD Unix-like operating system",
    screenSize: { width: 640, height: 480 },
    rgb: "100,30,30",
    image: `${THUMBNAIL_BASE}/freebsd.png`,
  },
  {
    id: "openbsd",
    name: "OpenBSD",
    year: "2010",
    profile: "openbsd",
    description: "Security-focused BSD Unix",
    screenSize: { width: 640, height: 480 },
    rgb: "200,180,30",
    image: `${THUMBNAIL_BASE}/openbsd.png`,
  },
  {
    id: "netbsd",
    name: "NetBSD",
    year: "2018",
    profile: "netbsd",
    description: "Portable BSD Unix - 'Of course it runs NetBSD'",
    screenSize: { width: 640, height: 480 },
    rgb: "180,80,30",
    image: `${THUMBNAIL_BASE}/netbsd.png`,
  },
  {
    id: "haiku",
    name: "Haiku",
    year: "2009",
    profile: "haiku",
    description: "Open-source revival of BeOS",
    screenSize: { width: 1024, height: 768 },
    rgb: "240,200,30",
    image: `${THUMBNAIL_BASE}/haiku.png`,
  },
  {
    id: "beos",
    name: "BeOS 5",
    year: "2000",
    profile: "beos",
    description: "Be Inc.'s media-focused desktop OS",
    screenSize: { width: 1024, height: 768 },
    rgb: "240,200,30",
    image: `${THUMBNAIL_BASE}/beos.png`,
  },
  {
    id: "reactos",
    name: "ReactOS",
    year: "2018",
    profile: "reactos",
    description: "Open-source Windows-compatible OS",
    screenSize: { width: 800, height: 600 },
    rgb: "0,80,160",
    image: `${THUMBNAIL_BASE}/reactos.png`,
  },
  {
    id: "kolibrios",
    name: "KolibriOS",
    year: "2009",
    profile: "kolibrios",
    description: "Tiny GUI OS written in assembly, fits on a floppy",
    screenSize: { width: 1024, height: 768 },
    rgb: "60,60,200",
    image: `${THUMBNAIL_BASE}/kolibrios.png`,
  },
  {
    id: "oberon",
    name: "Oberon",
    year: "1990",
    profile: "oberon",
    description: "Wirth's tiling-window research OS",
    screenSize: { width: 1024, height: 768 },
    rgb: "180,180,180",
    image: `${THUMBNAIL_BASE}/oberon.png`,
  },
  {
    id: "redox",
    name: "Redox",
    year: "2016",
    profile: "redox",
    description: "Modern microkernel OS written in Rust",
    screenSize: { width: 1024, height: 768 },
    rgb: "100,40,40",
    image: `${THUMBNAIL_BASE}/redox.png`,
  },
  {
    id: "minix",
    name: "Minix",
    year: "1987",
    profile: "minix",
    description: "Tanenbaum's microkernel teaching OS",
    screenSize: { width: 640, height: 480 },
    rgb: "30,80,30",
    image: `${THUMBNAIL_BASE}/minix.png`,
  },
  {
    id: "serenity",
    name: "SerenityOS",
    year: "2018",
    profile: "serenity",
    description: "Late-90s aesthetic with a modern Unix soul",
    screenSize: { width: 1024, height: 768 },
    rgb: "60,90,140",
    image: `${THUMBNAIL_BASE}/serenity.png`,
  },
  {
    id: "helenos",
    name: "HelenOS",
    year: "2011",
    profile: "helenos",
    description: "Multiserver microkernel research OS",
    screenSize: { width: 1024, height: 768 },
    rgb: "70,70,140",
    image: `${THUMBNAIL_BASE}/helenos.png`,
  },
  {
    id: "fiwix",
    name: "FiwixOS",
    year: "2018",
    profile: "fiwix",
    description: "Educational Unix-like kernel",
    screenSize: { width: 640, height: 480 },
    rgb: "40,60,80",
    image: `${THUMBNAIL_BASE}/fiwix.png`,
  },
  {
    id: "solos",
    name: "Sol OS",
    year: "2012",
    profile: "solos",
    description: "Hobby OS that fits on a single floppy",
    screenSize: { width: 640, height: 480 },
    rgb: "180,140,40",
    image: `${THUMBNAIL_BASE}/solos.png`,
  },
  {
    id: "doof",
    name: "Doom on a Floppy",
    year: "2024",
    profile: "doof",
    description: "DOOM crammed onto a 1.44MB floppy",
    screenSize: { width: 320, height: 200 },
    rgb: "120,30,30",
    image: `${THUMBNAIL_BASE}/doof.png`,
  },
  {
    id: "mikeos",
    name: "MikeOS",
    year: "2009",
    profile: "mikeos",
    description: "Hobby x86 OS in assembly with a CLI menu",
    screenSize: { width: 640, height: 480 },
    rgb: "30,50,80",
    image: `${THUMBNAIL_BASE}/mikeos.png`,
  },
];

interface InfinitePcStoreState {
  selectedPreset: PcPreset | null;
  isEmulatorLoaded: boolean;

  setSelectedPreset: (preset: PcPreset | null) => void;
  setIsEmulatorLoaded: (loaded: boolean) => void;
}

export const useInfinitePcStore = create<InfinitePcStoreState>()(
  persist(
    (set) => ({
      selectedPreset: null,
      isEmulatorLoaded: false,

      setSelectedPreset: (preset) => set({ selectedPreset: preset }),
      setIsEmulatorLoaded: (loaded) => set({ isEmulatorLoaded: loaded }),
    }),
    {
      name: "ryos:pc",
      version: 1,
      partialize: () => ({}),
    }
  )
);

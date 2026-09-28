/**
 * Vendor package → chunk groups, in capture-priority order.
 *
 * Rolldown groups include each captured module's dependencies recursively,
 * and a shared dependency lands in whichever group claims it first. Boot
 * groups are listed first so they claim shared deps (React, jsx-runtime,
 * tslib, @floating-ui, the Vite preload helper) before any lazy group can.
 * Otherwise a lazy chunk ends up hosting a boot-critical module and the entry
 * modulepreloads it (this previously put tiptap, tone and react-player on the
 * boot path). Because every group is dependency-closed and higher-priority
 * groups never import lower ones, the ordering also rules out chunk cycles.
 *
 * Boot (loaded immediately):
 * - react: react, react-dom, scheduler, jsx-runtime, use-sync-external-store
 * - ui-core: Radix primitives used by the shell (menu bar, dock, boot dialogs)
 *   plus the Radix internals they share with ui-extra.
 * - motion / zustand: see comments at their use sites
 *
 * Lazy (only fetched when a feature needs them):
 * - ui-extra: Radix primitives only used inside apps. It imports ui-core but
 *   never the reverse; the old manualChunks split (ui-form) formed a cycle
 *   and hit a TDZ crash in Vite 6.4.x, which priority ordering prevents.
 * - audio: heavy audio libs, deferred until Soundboard/iPod/Synth opens
 * - media-player: shared by iPod and Videos apps
 * - hangul: Korean romanization, only needed for lyrics
 * - tiptap: rich text editor, deferred until TextEdit opens. @tiptap/pm is
 *   excluded because it only exports subpaths and has no main entry point.
 * - three: 3D rendering, deferred until shader wallpapers / Synth need it
 * - pusher / webamp: see comments at their use sites
 *
 * Do NOT put `ai` / `@ai-sdk/react` in a vendor chunk. Rolldown colocates
 * React (+ jsx-runtime) into that chunk, then the entry / zustand / dock
 * import React from it. The AI SDK then modulepreloads at boot; a parse or
 * TDZ failure in that chunk blacks the page (html/body are `#000`).
 */
export const VENDOR_CHUNK_GROUPS: ReadonlyArray<{
  name: string;
  boot: boolean;
  packages: readonly string[];
}> = [
  {
    name: "react",
    boot: true,
    // use-sync-external-store is shared by react-i18next (boot) and
    // @tiptap/react (lazy).
    packages: ["react", "react-dom", "use-sync-external-store"],
  },
  {
    name: "ui-core",
    boot: true,
    packages: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-menubar",
      "@radix-ui/react-label",
      "@radix-ui/react-slider",
      "@radix-ui/react-tabs",
      // Imported directly by the shell; otherwise ui-extra would claim them
      // as dependencies of select / tooltip.
      "@radix-ui/react-slot",
      "@radix-ui/react-visually-hidden",
    ],
  },
  { name: "motion", boot: true, packages: ["motion"] },
  { name: "zustand", boot: true, packages: ["zustand"] },
  {
    name: "ui-extra",
    boot: false,
    packages: [
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-select",
      "@radix-ui/react-switch",
      "@radix-ui/react-checkbox",
    ],
  },
  {
    name: "audio",
    boot: false,
    packages: ["tone", "wavesurfer.js", "audio-buffer-utils"],
  },
  { name: "media-player", boot: false, packages: ["react-player"] },
  { name: "hangul", boot: false, packages: ["hangul-romanization"] },
  {
    name: "tiptap",
    boot: false,
    packages: [
      "@tiptap/core",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-table",
      "@tiptap/extension-list",
      "@tiptap/extension-text-align",
      "@tiptap/extensions",
      "@tiptap/suggestion",
    ],
  },
  { name: "three", boot: false, packages: ["three"] },
  { name: "pusher", boot: false, packages: ["pusher-js"] },
  { name: "webamp", boot: false, packages: ["webamp"] },
];

export const LAZY_VENDOR_CHUNK_NAMES: readonly string[] = VENDOR_CHUNK_GROUPS
  .filter((group) => !group.boot)
  .map((group) => group.name);

const NODE_MODULE_PACKAGE_RE =
  /node_modules[\\/](?:\.(?:pnpm|bun)[\\/][^\\/]+[\\/]node_modules[\\/])?(@[^\\/]+[\\/][^\\/]+|[^\\/]+)[\\/]/;

export function packageNameOf(id: string): string | undefined {
  return id.match(NODE_MODULE_PACKAGE_RE)?.[1]?.replaceAll("\\", "/");
}

export type VendorCodeSplittingGroup = {
  name: string;
  test: (id: string) => boolean;
  priority: number;
};

/** Rolldown `output.codeSplitting.groups`; higher priority captures first. */
export function vendorCodeSplittingGroups(): VendorCodeSplittingGroup[] {
  const groups = VENDOR_CHUNK_GROUPS.map(({ name, packages }, index) => {
    const packageSet = new Set(packages);
    return {
      name,
      test: (id: string) => {
        const packageName = packageNameOf(id);
        return packageName !== undefined && packageSet.has(packageName);
      },
      priority: VENDOR_CHUNK_GROUPS.length - index,
    };
  });
  return [
    // Vite's preload helper is imported by the entry and every dynamic
    // import site; pin it to its own tiny chunk so it never makes an
    // arbitrary vendor chunk load at boot.
    {
      name: "preload-helper",
      test: (id: string) => id.includes("vite/preload-helper"),
      priority: VENDOR_CHUNK_GROUPS.length + 1,
    },
    ...groups,
  ];
}

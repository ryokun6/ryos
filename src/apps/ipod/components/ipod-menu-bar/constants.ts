// Caps for the in-menubar library browser. Radix's MenubarSub doesn't
// virtualize, so a 5,000-song library would commit thousands of DOM
// nodes the moment the user opens the dropdown. The full library is
// always available inside the iPod itself (which IS virtualized).
export const MENUBAR_TRACK_LIMIT = 200;
export const MENUBAR_ARTIST_LIMIT = 100;

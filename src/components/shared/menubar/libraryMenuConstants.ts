// Caps for the in-menubar library browser shared by media apps (iPod,
// Karaoke). Radix's MenubarSub doesn't virtualize, so a 5,000-song library
// would commit thousands of DOM nodes the moment the user opens the dropdown.
// The full library is always available inside the app itself (virtualized).
export const MENUBAR_TRACK_LIMIT = 200;
export const MENUBAR_ARTIST_LIMIT = 100;

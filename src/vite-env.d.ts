/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

// epub.js ships this parser as untyped source. The package entry is mocked
// by Books cover tests, so highlight range merging imports the file directly.
declare module "epubjs/src/epubcfi.js" {
  const EpubCFI: new (cfi?: string) => unknown;
  export default EpubCFI;
}

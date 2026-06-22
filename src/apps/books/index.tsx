import type { BaseApp, BooksInitialData } from "@/apps/base/types";
import { BooksAppComponent } from "./components/books-app/BooksAppComponent";
import { appMetadata, helpItems } from "./metadata";

export const BooksApp: BaseApp<BooksInitialData> = {
  id: "books",
  name: "Books",
  icon: { type: "image", src: appMetadata.icon },
  description: "Read EPUB books",
  component: BooksAppComponent,
  helpItems,
  metadata: appMetadata,
};

export { appMetadata, helpItems };

import { STORES } from "@/utils/indexedDB";

export const getDocumentImageStoreForPath = (path: string) => {
  if (path.startsWith("/Documents/")) {
    return STORES.DOCUMENTS;
  }

  if (path.startsWith("/Images/")) {
    return STORES.IMAGES;
  }

  return null;
};

export const getContentStoreForPath = (path: string) => {
  if (path.startsWith("/Documents/")) {
    return STORES.DOCUMENTS;
  }

  if (path.startsWith("/Images/")) {
    return STORES.IMAGES;
  }

  if (path.startsWith("/Applets/")) {
    return STORES.APPLETS;
  }

  return null;
};

export const getFolderStoreForPath = (path: string) => {
  if (path.startsWith("/Documents")) {
    return STORES.DOCUMENTS;
  }

  if (path.startsWith("/Images")) {
    return STORES.IMAGES;
  }

  return null;
};

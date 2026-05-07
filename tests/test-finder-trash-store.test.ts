#!/usr/bin/env bun

import { beforeEach, describe, expect, test } from "bun:test";
import { useFilesStore, type FileSystemItem } from "../src/stores/useFilesStore";

const makeDirectory = (path: string, name: string): FileSystemItem => ({
  path,
  name,
  isDirectory: true,
  type: "directory",
  status: "active",
});

const makeDocument = (path: string, name: string): FileSystemItem => ({
  path,
  name,
  isDirectory: false,
  type: "text",
  uuid: `${name}-uuid`,
  status: "active",
});

describe("finder trash store", () => {
  beforeEach(() => {
    useFilesStore.setState({
      items: {
        "/Trash": {
          ...makeDirectory("/Trash", "Trash"),
          icon: "/icons/trash-empty.png",
        },
        "/Documents": makeDirectory("/Documents", "Documents"),
        "/Documents/Note.txt": makeDocument("/Documents/Note.txt", "Note.txt"),
      },
      libraryState: "loaded",
    });
  });

  test("restores trashed items to their original path metadata", () => {
    const store = useFilesStore.getState();

    store.removeItem("/Documents/Note.txt");

    expect(store.getItemsInPath("/Documents").map((item) => item.path)).toEqual([]);
    expect(store.getItemsInPath("/Trash").map((item) => item.path)).toEqual([
      "/Documents/Note.txt",
    ]);
    expect(store.getItem("/Documents/Note.txt")).toMatchObject({
      status: "trashed",
      originalPath: "/Documents/Note.txt",
    });

    store.restoreItem("/Documents/Note.txt");

    expect(store.getItemsInPath("/Trash")).toEqual([]);
    expect(store.getItemsInPath("/Documents").map((item) => item.path)).toEqual([
      "/Documents/Note.txt",
    ]);
    expect(store.getItem("/Documents/Note.txt")).toMatchObject({
      status: "active",
      originalPath: undefined,
      deletedAt: undefined,
    });
  });
});

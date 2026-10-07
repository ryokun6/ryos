import { inflateSync } from "fflate";

/**
 * Minimal lazy zip reader. Anki packages can hold thousands of media members
 * (100MB+), so entries are located from the central directory and only
 * decompressed on demand instead of inflating the whole archive at once.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export interface ZipReader {
  entries: Map<string, ZipEntry>;
  has: (name: string) => boolean;
  read: (name: string) => Uint8Array | null;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;

export class AnkiZipError extends Error {}

function readUint64(view: DataView, offset: number): number {
  return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;
}

function findEndOfCentralDirectory(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new AnkiZipError("Not a zip archive");
}

export function openZip(data: Uint8Array): ZipReader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  let count = view.getUint16(eocd + 10, true);
  let directoryOffset = view.getUint32(eocd + 16, true);

  const locator = eocd - 20;
  if (locator >= 0 && view.getUint32(locator, true) === ZIP64_LOCATOR_SIGNATURE) {
    const zip64Eocd = readUint64(view, locator + 8);
    if (view.getUint32(zip64Eocd, true) === ZIP64_EOCD_SIGNATURE) {
      count = readUint64(view, zip64Eocd + 32);
      directoryOffset = readUint64(view, zip64Eocd + 48);
    }
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let offset = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new AnkiZipError("Corrupt zip central directory");
    }
    const method = view.getUint16(offset + 10, true);
    let compressedSize = view.getUint32(offset + 20, true);
    let size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));

    // Zip64 extra field carries the real values for any 0xffffffff slots.
    let extra = offset + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let cursor = extra + 4;
        if (size === 0xffffffff) {
          size = readUint64(view, cursor);
          cursor += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = readUint64(view, cursor);
          cursor += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = readUint64(view, cursor);
      }
      extra += 4 + length;
    }

    entries.set(name, { name, method, compressedSize, size, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const read = (name: string): Uint8Array | null => {
    const entry = entries.get(name);
    if (!entry) return null;
    const local = entry.localHeaderOffset;
    if (view.getUint32(local, true) !== LOCAL_SIGNATURE) {
      throw new AnkiZipError(`Corrupt zip entry: ${name}`);
    }
    const start =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateSync(raw, { out: new Uint8Array(entry.size) });
    throw new AnkiZipError(`Unsupported zip compression method ${entry.method}`);
  };

  return { entries, has: (name) => entries.has(name), read };
}

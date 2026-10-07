import { decompress as zstdDecompress } from "fzstd";

/** Just enough protobuf decoding for Anki's config blobs and media map. */

export type ProtoValue = number | Uint8Array;
export type ProtoFields = Map<number, ProtoValue[]>;

export function decodeProto(data: Uint8Array): ProtoFields {
  const fields: ProtoFields = new Map();
  let pos = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (pos >= data.length) throw new Error("Truncated protobuf varint");
      const byte = data[pos++];
      result += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return result;
      shift += 7;
    }
  };
  while (pos < data.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let value: ProtoValue;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const length = varint();
      value = data.subarray(pos, pos + length);
      pos += length;
    } else if (wire === 1) {
      value = data.subarray(pos, pos + 8);
      pos += 8;
    } else if (wire === 5) {
      value = data.subarray(pos, pos + 4);
      pos += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}`);
    }
    const list = fields.get(field);
    if (list) list.push(value);
    else fields.set(field, [value]);
  }
  return fields;
}

const utf8 = new TextDecoder();

export function protoString(fields: ProtoFields, field: number): string {
  const value = fields.get(field)?.[0];
  return value instanceof Uint8Array ? utf8.decode(value) : "";
}

export function protoNumber(fields: ProtoFields, field: number): number {
  const value = fields.get(field)?.[0];
  return typeof value === "number" ? value : 0;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export function isZstd(data: Uint8Array): boolean {
  return ZSTD_MAGIC.every((byte, index) => data[index] === byte);
}

export function maybeZstd(data: Uint8Array): Uint8Array {
  return isZstd(data) ? zstdDecompress(data) : data;
}

/**
 * Package `media` member → zip member name ("0", "1", …) to filename.
 * Legacy packages use JSON; colpkg/apkg v3 use zstd protobuf MediaEntries
 * whose list index is the member name.
 */
export function parseAnkiMediaMap(data: Uint8Array | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!data || data.length === 0) return map;
  const bytes = maybeZstd(data);
  const first = bytes.find((byte) => byte > 0x20);
  if (first === 0x7b) {
    const parsed = JSON.parse(utf8.decode(bytes)) as Record<string, unknown>;
    for (const [member, name] of Object.entries(parsed)) {
      if (typeof name === "string") map.set(member, name);
    }
    return map;
  }
  const entries = decodeProto(bytes).get(1) ?? [];
  entries.forEach((entry, index) => {
    if (!(entry instanceof Uint8Array)) return;
    const name = protoString(decodeProto(entry), 1);
    if (name) map.set(String(index), name);
  });
  return map;
}

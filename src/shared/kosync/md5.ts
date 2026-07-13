/**
 * Minimal MD5 (hex) for KOReader document IDs.
 * Pure JS so it runs in the browser and Bun without Node crypto.
 */

function toUtf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

function md5Raw(data: Uint8Array): Uint8Array {
  const safeAdd = (x: number, y: number) => {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  };
  const bitRotateLeft = (num: number, cnt: number) =>
    (num << cnt) | (num >>> (32 - cnt));

  const md5cmn = (
    q: number,
    a: number,
    b: number,
    x: number,
    s: number,
    t: number
  ) => safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  const md5ff = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) => md5cmn((b & c) | (~b & d), a, b, x, s, t);
  const md5gg = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) => md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  const md5hh = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) => md5cmn(b ^ c ^ d, a, b, x, s, t);
  const md5ii = (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) => md5cmn(c ^ (b | ~d), a, b, x, s, t);

  const length = data.length;
  const numberOfBlocks = (((length + 8) >>> 6) << 4) + 16;
  const words = new Array<number>(numberOfBlocks).fill(0);
  for (let i = 0; i < length; i += 1) {
    words[i >> 2] |= data[i]! << ((i % 4) * 8);
  }
  words[length >> 2] |= 0x80 << ((length % 4) * 8);
  words[numberOfBlocks - 2] = length * 8;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = md5ff(a, b, c, d, words[i + 0]!, 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1]!, 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2]!, 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3]!, 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4]!, 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5]!, 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6]!, 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7]!, 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8]!, 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9]!, 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10]!, 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11]!, 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12]!, 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13]!, 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14]!, 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15]!, 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1]!, 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6]!, 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11]!, 14, 643717713);
    b = md5gg(b, c, d, a, words[i + 0]!, 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5]!, 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10]!, 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15]!, 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4]!, 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9]!, 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14]!, 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3]!, 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8]!, 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13]!, 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2]!, 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7]!, 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12]!, 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5]!, 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8]!, 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11]!, 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14]!, 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1]!, 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4]!, 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7]!, 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10]!, 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13]!, 4, 681279174);
    d = md5hh(d, a, b, c, words[i + 0]!, 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3]!, 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6]!, 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9]!, 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12]!, 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15]!, 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2]!, 23, -995338651);

    a = md5ii(a, b, c, d, words[i + 0]!, 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7]!, 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14]!, 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5]!, 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12]!, 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3]!, 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10]!, 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1]!, 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8]!, 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15]!, 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6]!, 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13]!, 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4]!, 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11]!, 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2]!, 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9]!, 21, -343485551);

    a = safeAdd(a, oldA);
    b = safeAdd(b, oldB);
    c = safeAdd(c, oldC);
    d = safeAdd(d, oldD);
  }

  const out = new Uint8Array(16);
  const write = (value: number, offset: number) => {
    out[offset] = value & 0xff;
    out[offset + 1] = (value >>> 8) & 0xff;
    out[offset + 2] = (value >>> 16) & 0xff;
    out[offset + 3] = (value >>> 24) & 0xff;
  };
  write(a, 0);
  write(b, 4);
  write(c, 8);
  write(d, 12);
  return out;
}

export function md5Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? toUtf8Bytes(input) : input;
  return toHex(md5Raw(bytes));
}

/**
 * KOReader partial MD5 ("binary" document matching).
 * Samples 1024 bytes at exponentially spaced offsets.
 */
export function partialMd5Hex(bytes: Uint8Array): string {
  // Incremental digest via concatenated samples (same as KOReader's md5.update loop).
  const samples: number[] = [];
  const step = 1024;
  for (let i = -1; i <= 10; i += 1) {
    const offset = step << (2 * i);
    if (offset >= bytes.length) break;
    const end = Math.min(offset + step, bytes.length);
    for (let j = offset; j < end; j += 1) {
      samples.push(bytes[j]!);
    }
  }
  return md5Hex(Uint8Array.from(samples));
}

export function filenameMd5FromPath(path: string): string {
  const slash = path.lastIndexOf("/");
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  return md5Hex(basename);
}

export function getKosyncServerUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/kosync`;
}

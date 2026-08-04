/**
 * @zxing/library 0.23.0 logs every failed decode attempt as:
 *   "MultiFormatReader: non-ReaderException from reader:"
 *
 * That is a library bug: NotFoundException / ChecksumException /
 * FormatException extend Exception directly in the JS port (unlike Java
 * ZXing where they subclass ReaderException), so the new instanceof check
 * never matches and continuous camera scanning floods the console ~2× per
 * frame (~500ms). Filter that message while the Stuff scanner is live —
 * matching the silent `continue` behavior of @zxing/library ≤0.22.
 */

const ZXING_NOISE_PREFIX =
  "MultiFormatReader: non-ReaderException from reader:";

let installDepth = 0;
let originalWarn: typeof console.warn | null = null;

/** True when this is the known ZXing MultiFormatReader frame-miss spam. */
export function isZxingMultiFormatReaderNoiseWarn(message: unknown): boolean {
  return typeof message === "string" && message.includes(ZXING_NOISE_PREFIX);
}

/**
 * Install a ref-counted `console.warn` filter for the ZXing MultiFormatReader
 * noise. Returns a dispose function; call it when the scanner session ends.
 */
export function installZxingMultiFormatReaderWarnFilter(): () => void {
  if (installDepth === 0) {
    originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (isZxingMultiFormatReaderNoiseWarn(args[0])) {
        return;
      }
      originalWarn!(...args);
    };
  }
  installDepth += 1;

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    installDepth = Math.max(0, installDepth - 1);
    if (installDepth === 0 && originalWarn) {
      console.warn = originalWarn;
      originalWarn = null;
    }
  };
}

/** Test helper: force-clear filter state between suites. */
export function resetZxingMultiFormatReaderWarnFilterForTests(): void {
  if (originalWarn) {
    console.warn = originalWarn;
    originalWarn = null;
  }
  installDepth = 0;
}

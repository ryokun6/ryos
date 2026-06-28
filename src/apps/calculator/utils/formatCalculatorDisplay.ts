const DECIMAL_PATTERN = /^-?\d+(?:\.\d*)?$/;
const SCIENTIFIC_PATTERN = /^(-?\d+)(?:\.(\d+))?([eE][+-]?\d+)$/;
const MAX_CONVERSION_SIGNIFICANT_DIGITS = 12;
const MAX_STANDARD_DISPLAY_DIGITS = 12;
const SCIENTIFIC_FRACTION_DIGITS = 8;
const SCIENTIFIC_LOWER_MAGNITUDE = 1e-9;

interface FittedFontSizeInput {
  baseFontSize: number;
  availableWidth: number;
  contentWidth: number;
  minFontSize?: number;
}

export function calculateFittedCalculatorFontSize({
  baseFontSize,
  availableWidth,
  contentWidth,
  minFontSize = 12,
}: FittedFontSizeInput): number {
  if (
    baseFontSize <= 0 ||
    availableWidth <= 0 ||
    contentWidth <= availableWidth
  ) {
    return baseFontSize;
  }

  return Math.max(
    minFontSize,
    Math.floor(baseFontSize * (availableWidth / contentWidth) * 100) / 100
  );
}

function getDecimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? "."
  );
}

function formatScientificNumber(value: number, locale: string): string {
  const scientific = value
    .toExponential(SCIENTIFIC_FRACTION_DIGITS)
    .replace(/(\.\d*?[1-9])0+e/u, "$1e")
    .replace(/\.0+e/u, "e");
  return scientific.replace(".", getDecimalSeparator(locale));
}

function countDisplayDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/**
 * Localize the calculator's presentation without changing its canonical
 * machine-readable display value.
 */
export function formatCalculatorDisplay(
  value: string,
  locale: string
): string {
  if (value === "Error") return value;

  const scientific = value.match(SCIENTIFIC_PATTERN);
  if (scientific) {
    const [, integer, fraction, exponent] = scientific;
    const decimal = getDecimalSeparator(locale);
    return `${integer}${fraction ? `${decimal}${fraction}` : ""}${exponent}`;
  }

  if (!DECIMAL_PATTERN.test(value)) return value;
  if (countDisplayDigits(value) > MAX_STANDARD_DISPLAY_DIGITS) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return formatScientificNumber(numericValue, locale);
    }
  }
  const decimalIndex = value.indexOf(".");
  const integerPart =
    decimalIndex === -1 ? value : value.slice(0, decimalIndex);
  const fractionPart =
    decimalIndex === -1 ? null : value.slice(decimalIndex + 1);

  try {
    const grouped = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(BigInt(integerPart));
    if (fractionPart === null) return grouped;
    return `${grouped}${getDecimalSeparator(locale)}${fractionPart}`;
  } catch {
    return value;
  }
}

export function formatCalculatorConversionResult(
  value: number,
  locale: string,
  isCurrency: boolean
): string {
  if (!Number.isFinite(value)) return "—";

  const magnitude = Math.abs(value);
  if (
    magnitude >= 10 ** MAX_STANDARD_DISPLAY_DIGITS ||
    (magnitude > 0 && magnitude < SCIENTIFIC_LOWER_MAGNITUDE)
  ) {
    return formatScientificNumber(value, locale);
  }

  if (isCurrency) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: MAX_CONVERSION_SIGNIFICANT_DIGITS,
  }).format(value);
}

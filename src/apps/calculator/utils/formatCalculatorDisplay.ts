const DECIMAL_PATTERN = /^-?\d+(?:\.\d*)?$/;
const SCIENTIFIC_PATTERN = /^(-?\d+)(?:\.(\d+))?([eE][+-]?\d+)$/;
const MAX_CONVERSION_SIGNIFICANT_DIGITS = 12;

function getDecimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? "."
  );
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

  if (isCurrency) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  const rounded = Number(
    value.toPrecision(MAX_CONVERSION_SIGNIFICANT_DIGITS)
  );
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 8,
  }).format(rounded);
}

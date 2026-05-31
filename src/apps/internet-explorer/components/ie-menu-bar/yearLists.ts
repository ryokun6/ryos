export function getFutureYears(currentYear: number): string[] {
  return [
    ...Array.from({ length: 8 }, (_, i) => (2030 + i * 10).toString()).filter(
      (yr) => parseInt(yr) !== currentYear
    ),
    "2150",
    "2200",
    "2250",
    "2300",
    "2400",
    "2500",
    "2750",
    "3000",
  ].sort((a, b) => parseInt(b) - parseInt(a));
}

export function getPastYears(currentYear: number): string[] {
  return [
    "1000 BC",
    "1 CE",
    "500",
    "800",
    "1000",
    "1200",
    "1400",
    "1600",
    "1700",
    "1800",
    "1900",
    "1910",
    "1920",
    "1930",
    "1940",
    "1950",
    "1960",
    "1970",
    "1980",
    "1985",
    "1990",
    ...Array.from({ length: currentYear - 1991 + 1 }, (_, i) =>
      (1991 + i).toString()
    ).filter((yr) => parseInt(yr) !== currentYear),
  ].reverse();
}

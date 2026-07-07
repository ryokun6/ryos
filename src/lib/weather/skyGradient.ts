/**
 * Sky gradient backgrounds keyed by WMO weather code + day/night, shared by
 * the dashboard weather widget and the chat `getWeather` tool card.
 */
export function getSkyGradient(code: number, isDay: boolean): string {
  if (!isDay) {
    if (code === 0)
      return "linear-gradient(180deg, #0B1A2E 0%, #1A2D4A 40%, #2A3F5C 100%)";
    if (code <= 3)
      return "linear-gradient(180deg, #0F1F35 0%, #1E3250 40%, #2E4462 100%)";
    if (code <= 48)
      return "linear-gradient(180deg, #1A1E25 0%, #2A303A 40%, #3A424D 100%)";
    if (code <= 67)
      return "linear-gradient(180deg, #0E151E 0%, #1C2630 40%, #2A3540 100%)";
    if (code <= 77)
      return "linear-gradient(180deg, #151C28 0%, #252F3E 40%, #354050 100%)";
    if (code <= 86)
      return "linear-gradient(180deg, #121922 0%, #222C38 40%, #323E4A 100%)";
    if (code <= 99)
      return "linear-gradient(180deg, #0A0F15 0%, #181E28 40%, #252D38 100%)";
    return "linear-gradient(180deg, #0B1A2E 0%, #1A2D4A 40%, #2A3F5C 100%)";
  }
  if (code === 0)
    return "linear-gradient(180deg, #4A90C4 0%, #7AB4D8 40%, #A8CBE0 100%)";
  if (code <= 3)
    return "linear-gradient(180deg, #5A8AAF 0%, #8BAFC5 40%, #B0C8D8 100%)";
  if (code <= 48)
    return "linear-gradient(180deg, #6B7B8D 0%, #8A96A3 40%, #A5AEB8 100%)";
  if (code <= 67)
    return "linear-gradient(180deg, #4A5A6A 0%, #6A7A8A 40%, #8A95A0 100%)";
  if (code <= 77)
    return "linear-gradient(180deg, #7A8A9A 0%, #9AABB8 40%, #C0CDD5 100%)";
  if (code <= 86)
    return "linear-gradient(180deg, #6A7A8A 0%, #8A9AAA 40%, #B0BCC5 100%)";
  if (code <= 99)
    return "linear-gradient(180deg, #3A4550 0%, #505E6A 40%, #6A7880 100%)";
  return "linear-gradient(180deg, #4A90C4 0%, #7AB4D8 40%, #A8CBE0 100%)";
}

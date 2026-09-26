import { isFiniteCoordinate, isValidCoordinate } from "./geo";
import type { YouBikeCityId, YouBikeStation } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickNumber(
  record: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    if (key in record) {
      const value = readNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function pickString(
  record: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    if (key in record) {
      const value = readString(record[key]);
      if (value) return value;
    }
  }
  return "";
}

function nestedName(value: unknown, zhKey: string, enKey: string): {
  zh: string;
  en: string;
} {
  const record = asRecord(value);
  if (!record) return { zh: "", en: "" };
  return {
    zh: readString(record[zhKey] ?? record.Zh_tw ?? record.zh),
    en: readString(record[enKey] ?? record.En ?? record.en),
  };
}

function nestedPosition(value: unknown): { latitude: number; longitude: number } | null {
  const record = asRecord(value);
  if (!record) return null;
  const latitude = readNumber(
    record.PositionLat ?? record.lat ?? record.latitude
  );
  const longitude = readNumber(
    record.PositionLon ?? record.lng ?? record.longitude
  );
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function stripYouBikePrefix(name: string): string {
  return name.replace(/^YouBike\s*2\.0\s*[_：:\-\s]*/i, "").trim() || name;
}

function isActiveFlag(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value).trim().toLowerCase();
  if (text === "1" || text === "true" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "no") return false;
  return true;
}

function unwrapStationRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const candidates = [
    record.retVal,
    record.data,
    record.result,
    record.records,
    record.stations,
    record.Datas,
    record.Data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    const nested = asRecord(candidate);
    if (nested) {
      const inner = nested.records ?? nested.results ?? nested.stations;
      if (Array.isArray(inner)) return inner;
    }
  }
  return [];
}

const STATION_PREFIX_CITY: Array<[string, YouBikeCityId]> = [
  // Official YouBike 2.0 station_no prefixes from the national dump.
  ["5001", "taipei"],
  ["5002", "newtaipei"],
  ["5003", "taoyuan"],
  ["5004", "hsinchu"],
  ["5005", "hsinchuCounty"],
  ["5006", "taichung"],
  ["5007", "miaoli"],
  ["5008", "kaohsiung"],
  ["5009", "tainan"],
  ["5010", "chiayi"],
  ["5011", "chiayi"],
  ["5012", "kaohsiung"],
  ["5013", "tainan"],
  ["5014", "pingtung"],
  ["5015", "taitung"],
  ["5082", "hsinchu"],
];

const AREA_CODE_CITY: Record<string, YouBikeCityId> = {
  "00": "taipei",
  "01": "taichung",
  "05": "newtaipei",
  "07": "taoyuan",
  "08": "chiayi",
  "09": "hsinchu",
  "0A": "miaoli",
  "0B": "hsinchuCounty",
  "10": "hsinchu",
  "11": "chiayi",
  "12": "kaohsiung",
  "13": "tainan",
  "14": "pingtung",
  "15": "taitung",
};

function inferCityFromId(
  stationId: string,
  fallback: YouBikeCityId,
  areaCode?: string
): YouBikeCityId {
  if (fallback !== "unknown") return fallback;
  for (const [prefix, city] of STATION_PREFIX_CITY) {
    if (stationId.startsWith(prefix)) return city;
  }
  if (areaCode) {
    const fromArea = AREA_CODE_CITY[areaCode];
    if (fromArea) return fromArea;
  }
  return fallback;
}

function parseOneStation(
  value: unknown,
  source: string,
  fallbackCity: YouBikeCityId
): YouBikeStation | null {
  const record = asRecord(value);
  if (!record) return null;

  const motcName = nestedName(record.StationName, "Zh_tw", "En");
  const motcAddress = nestedName(record.StationAddress, "Zh_tw", "En");
  const motcPosition = nestedPosition(record.StationPosition);

  const stationId = pickString(record, [
    "station_no",
    "sno",
    "StationID",
    "station_id",
    "id",
    "StationUID",
  ]);
  if (!stationId) return null;

  const latitude =
    motcPosition?.latitude ??
    pickNumber(record, ["latitude", "lat", "Latitude"]);
  const longitude =
    motcPosition?.longitude ??
    pickNumber(record, ["longitude", "lng", "lon", "Longitude"]);
  if (
    !isFiniteCoordinate(latitude) ||
    !isFiniteCoordinate(longitude) ||
    !isValidCoordinate({ latitude, longitude })
  ) {
    return null;
  }

  const bikesAvailable = Math.max(
    0,
    pickNumber(record, [
      "available_spaces",
      "available_rent_bikes",
      "AvailableRentBikes",
      "sbi",
      "bikes",
    ]) ?? 0
  );
  const docksAvailable = Math.max(
    0,
    pickNumber(record, [
      "empty_spaces",
      "available_return_bikes",
      "AvailableReturnBikes",
      "bemp",
      "docks",
    ]) ?? 0
  );
  const totalDocks = Math.max(
    bikesAvailable + docksAvailable,
    pickNumber(record, [
      "parking_spaces",
      "Quantity",
      "quantity",
      "total",
      "tot",
      "BikesCapacity",
      "Total",
    ]) ?? 0
  );

  const nameZh = stripYouBikePrefix(
    pickString(record, ["name_tw", "sna", "name"]) || motcName.zh
  );
  const nameEn = stripYouBikePrefix(
    pickString(record, ["name_en", "snaen"]) || motcName.en || nameZh
  );
  const address =
    pickString(record, ["address_tw", "ar", "address"]) || motcAddress.zh;
  const addressEn =
    pickString(record, ["address_en", "aren"]) || motcAddress.en || address;

  const areaCode = pickString(record, ["area_code"]);
  const city = inferCityFromId(stationId, fallbackCity, areaCode);
  const serviceStatus = pickNumber(record, ["ServiceStatus", "status"]);
  const active =
    serviceStatus === null
      ? isActiveFlag(record.act ?? record.Act ?? record.active)
      : serviceStatus === 1;

  return {
    id: `youbike:${city}:${stationId}`,
    stationId,
    city,
    name: nameZh || nameEn,
    nameEn: nameEn || nameZh,
    address,
    addressEn,
    area: pickString(record, ["district_tw", "sarea", "area"]),
    areaEn: pickString(record, ["district_en", "sareaen", "area_en"]),
    latitude,
    longitude,
    bikesAvailable,
    docksAvailable,
    totalDocks,
    isActive: active,
    updatedAt:
      pickString(record, [
        "mday",
        "updated_at",
        "time",
        "infoTime",
        "updateTime",
        "SrcUpdateTime",
        "UpdateTime",
      ]) || null,
    source,
  };
}

export function parseYouBikeStations(
  payload: unknown,
  options: { source: string; city: YouBikeCityId }
): YouBikeStation[] {
  const rows = unwrapStationRows(payload);
  const stations: YouBikeStation[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const station = parseOneStation(row, options.source, options.city);
    if (!station) continue;
    if (seen.has(station.id)) continue;
    seen.add(station.id);
    stations.push(station);
  }
  return stations;
}

export function mergeYouBikeStations(
  groups: YouBikeStation[][]
): YouBikeStation[] {
  const byId = new Map<string, YouBikeStation>();
  for (const group of groups) {
    for (const station of group) {
      byId.set(station.id, station);
    }
  }
  return Array.from(byId.values());
}

export function displayStationName(
  station: YouBikeStation,
  language: string | undefined
): string {
  const useChinese =
    !!language &&
    (language.toLowerCase().startsWith("zh") ||
      language.toLowerCase().includes("hant") ||
      language.toLowerCase().includes("hans"));
  return useChinese ? station.name : station.nameEn || station.name;
}

export function displayStationAddress(
  station: YouBikeStation,
  language: string | undefined
): string {
  const useChinese =
    !!language &&
    (language.toLowerCase().startsWith("zh") ||
      language.toLowerCase().includes("hant") ||
      language.toLowerCase().includes("hans"));
  return useChinese
    ? station.address || station.addressEn
    : station.addressEn || station.address;
}

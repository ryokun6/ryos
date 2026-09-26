import { describe, expect, test } from "bun:test";
import {
  parseBBoxQuery,
  filterStationsInBBox,
  regionFittingPoints,
} from "../../../src/apps/maps/youbike/geo";
import {
  YOUBIKE_OPEN_DATA_FEEDS,
  feedsIntersectingBBox,
} from "../../../src/apps/maps/youbike/feeds";
import {
  mergeYouBikeStations,
  parseYouBikeStations,
} from "../../../src/apps/maps/youbike/parseStations";

const TAIPEI_ROW = {
  sno: "500101001",
  sna: "YouBike2.0_捷運科技大樓站",
  sarea: "大安區",
  ar: "復興南路二段235號前",
  sareaen: "Daan Dist.",
  snaen: "YouBike2.0_MRT Technology Bldg. Sta.",
  aren: "No.235, Sec. 2, Fuxing S. Rd.",
  act: "1",
  Quantity: 28,
  available_rent_bikes: 4,
  latitude: 25.02605,
  longitude: 121.5436,
  available_return_bikes: 24,
  mday: "2026-09-25 20:30:04",
};

describe("parseYouBikeStations", () => {
  test("parses Taipei DOT YouBike 2.0 JSON rows", () => {
    const stations = parseYouBikeStations([TAIPEI_ROW], {
      source: "taipei",
      city: "taipei",
    });
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      id: "youbike:taipei:500101001",
      stationId: "500101001",
      city: "taipei",
      name: "捷運科技大樓站",
      nameEn: "MRT Technology Bldg. Sta.",
      bikesAvailable: 4,
      docksAvailable: 24,
      totalDocks: 28,
      isActive: true,
      latitude: 25.02605,
      longitude: 121.5436,
    });
  });

  test("parses the official national YouBike 2.0 dump schema", () => {
    const stations = parseYouBikeStations(
      [
        {
          country_code: "00",
          area_code: "01",
          type: 2,
          status: 1,
          station_no: "500601001",
          name_tw: "綠川東中山路口",
          district_tw: "中區",
          address_tw: "綠川東街/中山路口(東側)",
          name_en: "Luchuan E. St. / Zhongshan Rd.",
          district_en: "Central Dist",
          address_en: "Luchuan E. St. & Zhongshan Rd. Intersection (East)",
          parking_spaces: 16,
          available_spaces: 6,
          empty_spaces: 10,
          lat: "24.13785",
          lng: "120.68337",
          updated_at: "2026-09-26 20:29:31",
        },
      ],
      { source: "national", city: "unknown" }
    );
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      id: "youbike:taichung:500601001",
      stationId: "500601001",
      city: "taichung",
      name: "綠川東中山路口",
      nameEn: "Luchuan E. St. / Zhongshan Rd.",
      address: "綠川東街/中山路口(東側)",
      area: "中區",
      bikesAvailable: 6,
      docksAvailable: 10,
      totalDocks: 16,
      isActive: true,
      latitude: 24.13785,
      longitude: 120.68337,
      source: "national",
    });
  });

  test("maps national dump prefixes to Kaohsiung and Tainan", () => {
    const stations = parseYouBikeStations(
      [
        {
          station_no: "501201001",
          name_tw: "捷運美麗島站",
          available_spaces: 3,
          empty_spaces: 12,
          parking_spaces: 15,
          lat: 22.63213,
          lng: 120.30212,
          status: 1,
        },
        {
          station_no: "501301001",
          name_tw: "臺南火車站",
          available_spaces: 4,
          empty_spaces: 8,
          parking_spaces: 12,
          lat: 22.997,
          lng: 120.213,
          status: 1,
        },
      ],
      { source: "national", city: "unknown" }
    );
    expect(stations.map((station) => station.city)).toEqual([
      "kaohsiung",
      "tainan",
    ]);
  });

  test("treats national dump status=2 as inactive", () => {
    const stations = parseYouBikeStations(
      [
        {
          station_no: "500601002",
          name_tw: "維修中",
          available_spaces: 0,
          empty_spaces: 10,
          lat: 24.14,
          lng: 120.68,
          status: 2,
        },
      ],
      { source: "national", city: "unknown" }
    );
    expect(stations).toHaveLength(1);
    expect(stations[0].isActive).toBe(false);
  });

  test("parses MOTC TDX-style station objects", () => {
    const stations = parseYouBikeStations(
      {
        records: [
          {
            StationID: "500601001",
            StationName: { Zh_tw: "YouBike2.0_臺中火車站", En: "Taichung Station" },
            StationAddress: { Zh_tw: "臺灣大道一段", En: "Taiwan Blvd." },
            StationPosition: { PositionLat: 24.137, PositionLon: 120.685 },
            AvailableRentBikes: 9,
            AvailableReturnBikes: 7,
            BikesCapacity: 16,
            ServiceStatus: 1,
          },
        ],
      },
      { source: "taichung", city: "unknown" }
    );
    expect(stations).toHaveLength(1);
    expect(stations[0].city).toBe("taichung");
    expect(stations[0].name).toBe("臺中火車站");
    expect(stations[0].bikesAvailable).toBe(9);
    expect(stations[0].docksAvailable).toBe(7);
  });

  test("skips rows without coordinates", () => {
    const stations = parseYouBikeStations(
      [{ sno: "x", sna: "no coords" }],
      { source: "taipei", city: "taipei" }
    );
    expect(stations).toHaveLength(0);
  });

  test("treats act=0 and ServiceStatus=0 as inactive", () => {
    const stations = parseYouBikeStations(
      [
        { ...TAIPEI_ROW, act: "0" },
        {
          StationID: "500101002",
          StationPosition: { PositionLat: 25.03, PositionLon: 121.54 },
          ServiceStatus: 0,
          AvailableRentBikes: 1,
          AvailableReturnBikes: 1,
        },
      ],
      { source: "taipei", city: "taipei" }
    );
    expect(stations.every((station) => station.isActive === false)).toBe(true);
  });

  test("merges feeds by station id", () => {
    const a = parseYouBikeStations([TAIPEI_ROW], {
      source: "taipei",
      city: "taipei",
    });
    const b = parseYouBikeStations(
      [{ ...TAIPEI_ROW, available_rent_bikes: 8 }],
      { source: "taipei", city: "taipei" }
    );
    const merged = mergeYouBikeStations([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].bikesAvailable).toBe(8);
  });
});

describe("parseBBoxQuery", () => {
  test("accepts a valid Taipei viewport", () => {
    expect(
      parseBBoxQuery({
        south: "25.02",
        west: "121.53",
        north: "25.04",
        east: "121.56",
      })
    ).toEqual({
      south: 25.02,
      west: 121.53,
      north: 25.04,
      east: 121.56,
    });
  });

  test("rejects inverted and incomplete boxes", () => {
    expect(
      parseBBoxQuery({
        south: "25.1",
        north: "25.0",
        west: "121.5",
        east: "121.6",
      })
    ).toBeNull();
    expect(parseBBoxQuery({ south: "25.0" })).toBeNull();
  });
});

describe("filterStationsInBBox", () => {
  test("keeps only stations inside the box", () => {
    const stations = parseYouBikeStations(
      [
        TAIPEI_ROW,
        { ...TAIPEI_ROW, sno: "500101999", latitude: 24.1, longitude: 120.6 },
      ],
      { source: "taipei", city: "taipei" }
    );
    const filtered = filterStationsInBBox(stations, {
      south: 25.02,
      west: 121.53,
      north: 25.04,
      east: 121.56,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stationId).toBe("500101001");
  });
});

describe("feedsIntersectingBBox", () => {
  test("uses the official YouBike app national dump as the only source", () => {
    expect(YOUBIKE_OPEN_DATA_FEEDS).toHaveLength(1);
    expect(YOUBIKE_OPEN_DATA_FEEDS[0]).toMatchObject({
      id: "national",
      url: "https://apis.youbike.com.tw/json/station-yb2.json",
    });
    expect(YOUBIKE_OPEN_DATA_FEEDS[0].optional).toBeUndefined();
  });

  test("selects the national dump for Taipei and Taichung viewports", () => {
    const taipei = feedsIntersectingBBox({
      south: 25.02,
      west: 121.55,
      north: 25.05,
      east: 121.58,
    });
    const taichung = feedsIntersectingBBox({
      south: 24.12,
      west: 120.64,
      north: 24.16,
      east: 120.7,
    });
    expect(taipei.map((feed) => feed.id)).toEqual(["national"]);
    expect(taichung.map((feed) => feed.id)).toEqual(["national"]);
  });

  test("without a bbox returns the required national dump", () => {
    const feeds = feedsIntersectingBBox(null);
    expect(feeds.map((feed) => feed.id)).toEqual(["national"]);
  });
});

describe("regionFittingPoints", () => {
  test("fits a Taipei 101 to Main Station hop without island-scale zoom", () => {
    const region = regionFittingPoints([
      { latitude: 25.03396, longitude: 121.56447 },
      { latitude: 25.04792, longitude: 121.51708 },
    ]);
    expect(region).not.toBeNull();
    expect(region!.latitudeDelta).toBeLessThan(0.12);
    expect(region!.longitudeDelta).toBeLessThan(0.12);
    expect(region!.latitudeDelta).toBeGreaterThan(0.01);
    expect(region!.center.latitude).toBeGreaterThan(25.03);
    expect(region!.center.latitude).toBeLessThan(25.05);
  });

  test("clamps a trans-Pacific pair so the camera stays local", () => {
    const region = regionFittingPoints([
      { latitude: 25.03396, longitude: 121.56447 },
      { latitude: 37.7749, longitude: -122.4194 },
    ]);
    expect(region).not.toBeNull();
    expect(region!.latitudeDelta).toBeLessThanOrEqual(0.28);
    expect(region!.longitudeDelta).toBeLessThanOrEqual(0.28);
  });
});

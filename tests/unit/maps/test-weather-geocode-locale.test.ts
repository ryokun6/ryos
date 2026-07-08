import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  localizePlaceName,
  pickNominatimAddressName,
  resolveGeocodeLocale,
  resolveNominatimPlaceName,
} from "../../../src/lib/weather/geocodeLocale";
import { reverseGeocodeCity } from "../../../src/lib/weather/openMeteo";

/** Nominatim returns simplified Chinese for US counties regardless of zh-Hant. */
const SAN_MATEO_COUNTY_SIMPLIFIED = "圣马刁县";
const SAN_MATEO_COUNTY_TRADITIONAL = "聖馬刁縣";

/** Suginami as returned by Nominatim reverse geocode with ja Accept-Language. */
const SUGINAMI_JA = "杉並区";
const SUGINAMI_TRADITIONAL = "杉並區";

const SAN_MATEO_COUNTY_EN = "San Mateo County";
const SUGINAMI_EN = "Suginami";

describe("resolveGeocodeLocale", () => {
  test("maps Traditional Chinese tags to zh-TW Accept-Language", () => {
    for (const locale of ["zh-Hant", "zh-TW", "zh-HK", "zh-MO"]) {
      expect(resolveGeocodeLocale(locale)).toEqual({
        acceptLanguage: "zh-TW,zh;q=0.9",
        chineseScript: "traditional",
      });
    }
  });

  test("maps Simplified Chinese tags to zh-CN Accept-Language", () => {
    for (const locale of ["zh-Hans", "zh-CN", "zh-SG", "zh"]) {
      expect(resolveGeocodeLocale(locale)).toEqual({
        acceptLanguage: "zh-CN,zh;q=0.9",
        chineseScript: "simplified",
      });
    }
  });

  test("maps Japanese and English tags", () => {
    expect(resolveGeocodeLocale("ja")).toEqual({
      acceptLanguage: "ja,en;q=0.5",
      chineseScript: null,
    });
    expect(resolveGeocodeLocale("ja-JP")).toEqual({
      acceptLanguage: "ja,en;q=0.5",
      chineseScript: null,
    });
    expect(resolveGeocodeLocale("en")).toEqual({
      acceptLanguage: "en",
      chineseScript: null,
    });
    expect(resolveGeocodeLocale("en-US")).toEqual({
      acceptLanguage: "en",
      chineseScript: null,
    });
  });

  test("returns no headers when locale is absent", () => {
    expect(resolveGeocodeLocale()).toEqual({
      acceptLanguage: undefined,
      chineseScript: null,
    });
    expect(resolveGeocodeLocale("   ")).toEqual({
      acceptLanguage: undefined,
      chineseScript: null,
    });
  });
});

describe("localizePlaceName", () => {
  test("converts San Mateo County simplified upstream text to Traditional for zh-Hant", async () => {
    expect(
      await localizePlaceName(SAN_MATEO_COUNTY_SIMPLIFIED, "zh-Hant")
    ).toBe(SAN_MATEO_COUNTY_TRADITIONAL);
    expect(await localizePlaceName(SAN_MATEO_COUNTY_SIMPLIFIED, "zh-TW")).toBe(
      SAN_MATEO_COUNTY_TRADITIONAL
    );
  });

  test("keeps San Mateo County simplified for zh-Hans / zh-CN", async () => {
    expect(
      await localizePlaceName(SAN_MATEO_COUNTY_SIMPLIFIED, "zh-Hans")
    ).toBe(SAN_MATEO_COUNTY_SIMPLIFIED);
    expect(await localizePlaceName(SAN_MATEO_COUNTY_SIMPLIFIED, "zh-CN")).toBe(
      SAN_MATEO_COUNTY_SIMPLIFIED
    );
  });

  test("converts Traditional Suginami labels for zh-Hant when upstream mixed script", async () => {
    expect(await localizePlaceName(SUGINAMI_JA, "zh-Hant")).toBe(
      SUGINAMI_TRADITIONAL
    );
    expect(await localizePlaceName(SUGINAMI_TRADITIONAL, "zh-Hant")).toBe(
      SUGINAMI_TRADITIONAL
    );
  });

  test("leaves Japanese Suginami unchanged for ja locale", async () => {
    expect(await localizePlaceName(SUGINAMI_JA, "ja")).toBe(SUGINAMI_JA);
    expect(await localizePlaceName(SUGINAMI_JA, "ja-JP")).toBe(SUGINAMI_JA);
  });

  test("leaves English place names unchanged", async () => {
    expect(await localizePlaceName(SAN_MATEO_COUNTY_EN, "en")).toBe(
      SAN_MATEO_COUNTY_EN
    );
    expect(await localizePlaceName(SUGINAMI_EN, "en")).toBe(SUGINAMI_EN);
    expect(await localizePlaceName(SAN_MATEO_COUNTY_EN, "zh-Hant")).toBe(
      SAN_MATEO_COUNTY_EN
    );
  });

  test("converts Traditional upstream text to Simplified for zh-Hans", async () => {
    expect(await localizePlaceName(SAN_MATEO_COUNTY_TRADITIONAL, "zh-Hans")).toBe(
      SAN_MATEO_COUNTY_SIMPLIFIED
    );
  });

  test("picks Traditional variant from Nominatim multi-script city bundles", async () => {
    expect(
      await resolveNominatimPlaceName("圣马特奥;聖馬特奧;聖馬刁", "zh-Hant")
    ).toBe("聖馬特奧");
    expect(
      await resolveNominatimPlaceName("圣马特奥;聖馬特奧;聖馬刁", "zh-Hans")
    ).toBe("圣马特奥");
  });
});

describe("pickNominatimAddressName", () => {
  test("prefers county when city contains multi-script variants", () => {
    expect(
      pickNominatimAddressName({
        city: "圣马特奥;聖馬特奧;聖馬刁",
        county: SAN_MATEO_COUNTY_SIMPLIFIED,
      })
    ).toBe(SAN_MATEO_COUNTY_SIMPLIFIED);
  });

  test("keeps a single-script city label", () => {
    expect(
      pickNominatimAddressName({
        city: SUGINAMI_JA,
      })
    ).toBe(SUGINAMI_JA);
  });
});

describe("weather geocode fixtures", () => {
  test("San Mateo County reverse-geocode fixture localizes per requested locale", async () => {
    const nominatimFixture = {
      address: { county: SAN_MATEO_COUNTY_SIMPLIFIED },
    };
    const raw = nominatimFixture.address.county;

    expect(await localizePlaceName(raw, "zh-Hant")).toBe(
      SAN_MATEO_COUNTY_TRADITIONAL
    );
    expect(await localizePlaceName(raw, "zh-Hans")).toBe(
      SAN_MATEO_COUNTY_SIMPLIFIED
    );
    expect(await localizePlaceName(SAN_MATEO_COUNTY_EN, "en")).toBe(
      SAN_MATEO_COUNTY_EN
    );
  });

  test("Suginami search fixture localizes per requested locale", async () => {
    const nominatimFixture = {
      address: { city: SUGINAMI_TRADITIONAL, country_code: "jp" },
    };
    const raw = nominatimFixture.address.city;

    expect(await localizePlaceName(raw, "zh-Hant")).toBe(SUGINAMI_TRADITIONAL);
    expect(await localizePlaceName(SUGINAMI_JA, "ja")).toBe(SUGINAMI_JA);
    expect(await localizePlaceName(SUGINAMI_EN, "en")).toBe(SUGINAMI_EN);
  });
});

describe("reverseGeocodeCity locale plumbing", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("applies Traditional Chinese conversion to mocked Nominatim county response", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      expect((init as RequestInit).headers).toMatchObject({
        "Accept-Language": "zh-TW,zh;q=0.9",
      });
      return new Response(
        JSON.stringify({
          address: {
            city: "圣马特奥;聖馬特奧;聖馬刁",
            county: SAN_MATEO_COUNTY_SIMPLIFIED,
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const city = await reverseGeocodeCity(37.563, -122.3255, "zh-Hant", {
      userAgent: "ryOS-test",
    });
    expect(city).toBe(SAN_MATEO_COUNTY_TRADITIONAL);
  });

  test("returns English county name unchanged for en locale", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      expect((init as RequestInit).headers).toMatchObject({
        "Accept-Language": "en",
      });
      return new Response(
        JSON.stringify({ address: { county: SAN_MATEO_COUNTY_EN } }),
        { status: 200 }
      );
    }) as typeof fetch;

    const city = await reverseGeocodeCity(37.563, -122.3255, "en");
    expect(city).toBe(SAN_MATEO_COUNTY_EN);
  });

  test("returns Japanese city label unchanged for ja locale", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      expect((init as RequestInit).headers).toMatchObject({
        "Accept-Language": "ja,en;q=0.5",
      });
      return new Response(
        JSON.stringify({ address: { city: SUGINAMI_JA } }),
        { status: 200 }
      );
    }) as typeof fetch;

    const city = await reverseGeocodeCity(35.6995, 139.6364, "ja");
    expect(city).toBe(SUGINAMI_JA);
  });
});

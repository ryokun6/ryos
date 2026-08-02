#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  brandFromWikipediaDescription,
  classifyProductQuery,
  mergeAllProductResults,
  mergeProductResults,
  pickBestOpenFactsProduct,
  pickBestOpenLibraryDoc,
  pickBestUpcItem,
  pickBestWikipediaPage,
  PRODUCT_LOOKUP_MAX_RESULTS,
  rankProductLookupCandidates,
  scoreTitleMatch,
} from "../../../api/stuff/_helpers/_productLookup";
import {
  appleProductSlugCandidates,
  itunesArtworkUrl,
  itunesUpcCandidates,
  looksLikeAppleProductQuery,
  looksLikeITunesSoftwareQuery,
  mapITunesAlbumToProductResult,
  parseAmazonSearchHtml,
  parseAppleProductPageHtml,
  pickBestDuckDuckGoImageResult,
  pickBestITunesAlbum,
  scoreITunesAlbumMatch,
  upgradeAmazonImageUrl,
} from "../../../api/stuff/_helpers/_productRetailLookup";
import {
  parseAmazonCardPrice,
  parseMoneyAmount,
  pickOfferMoney,
} from "../../../api/stuff/_helpers/_productPrice";

describe("classifyProductQuery", () => {
  test("detects ISBN-13", () => {
    expect(classifyProductQuery("978-0-14-0329473")).toEqual({
      kind: "isbn",
      normalized: "9780140329473",
    });
  });

  test("detects ISBN-10", () => {
    expect(classifyProductQuery("0140329470")).toEqual({
      kind: "isbn",
      normalized: "0140329470",
    });
  });

  test("detects UPC/EAN barcodes", () => {
    expect(classifyProductQuery("3017620422003")).toEqual({
      kind: "barcode",
      normalized: "3017620422003",
    });
    expect(classifyProductQuery("01234567")).toEqual({
      kind: "barcode",
      normalized: "01234567",
    });
  });

  test("treats free text as title", () => {
    expect(classifyProductQuery("Vintage Desk Lamp")).toEqual({
      kind: "title",
      normalized: "Vintage Desk Lamp",
    });
  });

  test("does not classify mixed alphanumeric codes as barcodes", () => {
    expect(classifyProductQuery("ABC-12345")).toEqual({
      kind: "title",
      normalized: "ABC-12345",
    });
  });
});

describe("scoreTitleMatch", () => {
  test("scores exact product titles higher than long accessory listings", () => {
    const query = "iMac G4";
    const exact = scoreTitleMatch("iMac G4", query);
    const accessory = scoreTitleMatch(
      "1 GB M9594G/A 1GB PC2700 SODIMM PowerBook iBook G4 iMac G4 Memory RAM",
      query
    );
    expect(exact).toBeGreaterThan(accessory);
  });

  test("penalizes partial Wikipedia disambiguation titles", () => {
    expect(scoreTitleMatch("Mixer (appliance)", "KitchenAid mixer")).toBeLessThan(
      scoreTitleMatch("KitchenAid Artisan Stand Mixer", "KitchenAid mixer")
    );
  });
});

describe("pickBestOpenLibraryDoc", () => {
  test("prefers a hit with cover_i", () => {
    const doc = pickBestOpenLibraryDoc([
      { title: "No Cover" },
      { title: "With Cover", cover_i: 123 },
    ]);
    expect(doc?.title).toBe("With Cover");
  });
});

describe("pickBestUpcItem", () => {
  test("prefers a concise title match with images over a long accessory listing", () => {
    const item = pickBestUpcItem(
      [
        {
          title:
            "1 GB M9594G/A 1GB PC2700 SODIMM PowerBook iBook G4 iMac G4 Memory RAM",
          brand: "Dataram",
          images: ["https://example.com/ram.jpg"],
        },
        {
          title: "Apple iMac G4",
          brand: "Apple",
          images: ["https://example.com/imac.jpg"],
        },
      ],
      "iMac G4"
    );
    expect(item?.title).toBe("Apple iMac G4");
  });

  test("rejects weak accessory-only matches", () => {
    expect(
      pickBestUpcItem(
        [
          {
            title:
              "1 GB M9594G/A 1GB PC2700 SODIMM PowerBook iBook G4 iMac G4 Memory RAM",
            images: ["https://example.com/ram.jpg"],
          },
        ],
        "iMac G4"
      )
    ).toBeUndefined();
  });

  test("rejects merch listings for a literary title", () => {
    expect(
      pickBestUpcItem(
        [
          {
            title:
              "Women s The Great Gatsby Tom Buchanan Poster Graphic Tee Black Small",
            brand: "The Great Gatsby",
            images: ["https://example.com/tee.jpg"],
          },
        ],
        "The Great Gatsby"
      )
    ).toBeUndefined();
  });
});

describe("pickBestOpenFactsProduct", () => {
  test("prefers a product with a front image", () => {
    const product = pickBestOpenFactsProduct(
      [
        { product_name: "No Image Mixer", brands: "KitchenAid" },
        {
          product_name: "KitchenAid Stand Mixer",
          brands: "KitchenAid",
          image_front_url: "https://images.openproductsfacts.org/mixer.jpg",
        },
      ],
      "KitchenAid mixer"
    );
    expect(product?.product_name).toBe("KitchenAid Stand Mixer");
  });
});

describe("pickBestWikipediaPage", () => {
  test("prefers the top-ranked page that has an image and matches the query", () => {
    const page = pickBestWikipediaPage(
      {
        "2": {
          title: "IMac",
          index: 2,
          thumbnail: { source: "https://upload.wikimedia.org/imac.jpg" },
        },
        "1": {
          title: "IMac G4",
          index: 1,
          thumbnail: { source: "https://upload.wikimedia.org/imac-g4.jpg" },
        },
        "3": { title: "No Image Page", index: 0 },
      },
      "iMac G4"
    );
    expect(page?.title).toBe("IMac G4");
  });

  test("rejects weakly related pages", () => {
    expect(
      pickBestWikipediaPage(
        {
          "1": {
            title: "Mixer (appliance)",
            index: 1,
            thumbnail: { source: "https://upload.wikimedia.org/mixer.jpg" },
          },
        },
        "KitchenAid mixer"
      )
    ).toBeUndefined();
  });
});

describe("brandFromWikipediaDescription", () => {
  test("extracts manufacturer from short description", () => {
    expect(
      brandFromWikipediaDescription(
        "all-in-one personal computer designed, manufactured, and sold by Apple Computer, Inc."
      )
    ).toBe("Apple Computer");
  });

  test("returns undefined when no manufacturer phrase exists", () => {
    expect(brandFromWikipediaDescription("a kitchen appliance")).toBeUndefined();
  });
});

describe("mergeProductResults", () => {
  test("prefers the result that includes an image URL", () => {
    const merged = mergeProductResults(
      {
        found: true,
        title: "Metadata Only",
        source: "openlibrary",
      },
      {
        found: true,
        title: "With Cover",
        imageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
        source: "google_books",
      }
    );
    expect(merged?.title).toBe("With Cover");
    expect(merged?.imageUrl).toContain("openlibrary.org");
    expect(merged?.source).toBe("google_books");
  });

  test("fills missing brand from the non-preferred hit", () => {
    const merged = mergeProductResults(
      {
        found: true,
        title: "Stand Mixer",
        imageUrl: "https://example.com/mixer.jpg",
        source: "upcitemdb",
      },
      {
        found: true,
        title: "KitchenAid Mixer",
        brand: "KitchenAid",
        source: "openproductsfacts",
      }
    );
    expect(merged?.title).toBe("Stand Mixer");
    expect(merged?.brand).toBe("KitchenAid");
    expect(merged?.source).toBe("upcitemdb");
  });

  test("prefers a more relevant imaged hit when query is provided", () => {
    const merged = mergeProductResults(
      {
        found: true,
        title: "Mixer (appliance)",
        imageUrl: "https://upload.wikimedia.org/mixer.jpg",
        source: "wikipedia",
      },
      {
        found: true,
        title: "KitchenAid Artisan Stand Mixer",
        brand: "KitchenAid",
        imageUrl: "https://example.com/kitchenaid.jpg",
        source: "upcitemdb",
      },
      { query: "KitchenAid mixer" }
    );
    expect(merged?.source).toBe("upcitemdb");
    expect(merged?.brand).toBe("KitchenAid");
  });
});

describe("mergeAllProductResults", () => {
  test("keeps a relevant product over a later book hit", () => {
    const merged = mergeAllProductResults(
      [
        {
          found: true,
          title: "iMac G4",
          brand: "Apple",
          imageUrl: "https://upload.wikimedia.org/imac-g4.jpg",
          source: "wikipedia",
        },
        {
          found: true,
          title: "iMac G4: Design History",
          brand: "Some Author",
          imageUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
          source: "openlibrary",
        },
      ],
      { query: "iMac G4" }
    );
    expect(merged?.title).toBe("iMac G4");
    expect(merged?.source).toBe("wikipedia");
    expect(merged?.brand).toBe("Apple");
  });

  test("falls back to book cover when product sources lack images", () => {
    const merged = mergeAllProductResults(
      [
        {
          found: true,
          title: "Mystery Gadget",
          source: "upcitemdb",
        },
        {
          found: true,
          title: "Mystery Gadget Manual",
          imageUrl: "https://covers.openlibrary.org/b/id/2-L.jpg",
          source: "google_books",
        },
      ],
      { query: "Mystery Gadget" }
    );
    expect(merged?.imageUrl).toContain("openlibrary.org");
    expect(merged?.source).toBe("google_books");
  });
});

describe("product vs cookbook merge preference", () => {
  test("imaged product primary wins over a higher-scoring cookbook without query override", () => {
    // Mirrors title-search behavior: once a product hit looks solid, merge without
    // query scoring so cookbooks cannot displace the appliance.
    const merged = mergeProductResults(
      {
        found: true,
        title: "KitchenAid Ultra Power KSM95WH Stand Mixer",
        brand: "KitchenAid",
        imageUrl: "https://example.com/mixer.jpg",
        source: "upcitemdb",
      },
      {
        found: true,
        title: "KitchenAid Stand Mixer Cookbook",
        brand: "Publications International Ltd.",
        imageUrl: "https://covers.openlibrary.org/b/id/2-L.jpg",
        source: "openlibrary",
      }
    );
    expect(merged?.source).toBe("upcitemdb");
    expect(merged?.brand).toBe("KitchenAid");
  });
});

describe("retail scrape helpers", () => {
  test("upgradeAmazonImageUrl requests a larger packshot", () => {
    expect(
      upgradeAmazonImageUrl(
        "https://m.media-amazon.com/images/I/61O3iMlnJIL._AC_UY218_.jpg"
      )
    ).toContain("._AC_SL1000_.");
  });

  test("parseAmazonSearchHtml skips sponsored ads and returns priced organic hit", () => {
    const html = `
      <div data-asin="B0SPONSORED" data-component-type="s-search-result" class="AdHolder">
        <img class="s-image" src="https://m.media-amazon.com/images/I/11sponsored._AC_UY218_.jpg"
          alt="Sponsored Ad - Random Bundle Deal" />
        <span class="a-price"><span class="a-offscreen">$9.99</span></span>
      </div>
      <div data-asin="B0REALASIN" data-component-type="s-search-result">
        <img class="s-image" src="https://m.media-amazon.com/images/I/61O3iMlnJIL._AC_UY218_.jpg"
          alt="Sony WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black" />
        <span class="a-price"><span class="a-offscreen">$248.00</span></span>
      </div>
    `;
    const hit = parseAmazonSearchHtml(html, "Sony WH-1000XM5");
    expect(hit?.title).toContain("Sony WH-1000XM5");
    expect(hit?.productUrl).toBe("https://www.amazon.com/dp/B0REALASIN");
    expect(hit?.imageUrl).toContain("media-amazon.com");
    expect(hit?.originalPrice).toBe(248);
    expect(hit?.currency).toBe("USD");
  });

  test("parseAmazonSearchHtml soft-fails on captcha markup", () => {
    expect(
      parseAmazonSearchHtml(
        "<html><title>Robot Check</title><p>enter the characters you see</p></html>",
        "Mixer"
      )
    ).toBeUndefined();
  });

  test("pickBestDuckDuckGoImageResult prefers retail packshots over weak titles", () => {
    const hit = pickBestDuckDuckGoImageResult(
      [
        {
          title: "Random kitchen collage",
          image: "https://cdn.example.com/collage.jpg",
          width: 1600,
          height: 900,
        },
        {
          title: "KitchenAid Artisan Series 5 qt Stand Mixer Porcelain White",
          image:
            "https://i5.walmartimages.com/seo/KitchenAid-Artisan-Series-5-qt-Stand-Mixer.jpg",
          width: 1200,
          height: 1200,
          url: "https://www.walmart.com/ip/kitchenaid",
        },
      ],
      "KitchenAid Artisan Stand Mixer"
    );
    expect(hit?.title).toContain("KitchenAid");
    expect(hit?.imageUrl).toContain("walmartimages.com");
  });

  test("looksLikeAppleProductQuery detects hardware and slug candidates", () => {
    expect(looksLikeAppleProductQuery("AirPods Pro")).toBe(true);
    expect(looksLikeAppleProductQuery("Herman Miller Aeron")).toBe(false);
    expect(appleProductSlugCandidates("AirPods Pro")).toContain("airpods-pro");
    expect(looksLikeITunesSoftwareQuery("AirPods Pro")).toBe(false);
    expect(looksLikeITunesSoftwareQuery("Things 3 ios app")).toBe(true);
  });

  test("itunesArtworkUrl upsizes square bb artwork paths", () => {
    expect(
      itunesArtworkUrl(
        "https://is1-ssl.mzstatic.com/image/thumb/Music/x/y.jpg/100x100bb.jpg"
      )
    ).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/Music/x/y.jpg/600x600bb.jpg"
    );
    expect(
      itunesArtworkUrl(
        "http://is1-ssl.mzstatic.com/image/thumb/Music/x/y.jpg/60x60bb.png"
      )
    ).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/Music/x/y.jpg/600x600bb.png"
    );
    expect(itunesArtworkUrl(undefined)).toBeUndefined();
  });

  test("itunesUpcCandidates expands 12↔13 digit UPC/EAN forms", () => {
    expect(itunesUpcCandidates("720642462928")).toEqual([
      "720642462928",
      "0720642462928",
    ]);
    expect(itunesUpcCandidates("0720642462928")).toEqual([
      "0720642462928",
      "720642462928",
    ]);
    expect(itunesUpcCandidates("978-0-14-0329473")).toEqual(["9780140329473"]);
    expect(itunesUpcCandidates("000000000000")).toEqual([]);
    expect(itunesUpcCandidates("111111111111")).toEqual([]);
  });

  test("mapITunesAlbumToProductResult maps album JSON to candidate shape", () => {
    const mapped = mapITunesAlbumToProductResult({
      wrapperType: "collection",
      collectionType: "Album",
      collectionName: "Weezer (Blue Album)",
      artistName: "Weezer",
      artworkUrl100:
        "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ab.jpg/100x100bb.jpg",
      collectionViewUrl:
        "https://music.apple.com/us/album/weezer-blue-album/123",
      collectionPrice: 9.99,
      currency: "USD",
    });
    expect(mapped).toEqual({
      found: true,
      title: "Weezer (Blue Album)",
      brand: "Weezer",
      imageUrl:
        "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ab.jpg/600x600bb.jpg",
      productUrl: "https://music.apple.com/us/album/weezer-blue-album/123",
      originalPrice: 9.99,
      currency: "USD",
      source: "itunes_music",
    });
  });

  test("mapITunesAlbumToProductResult rejects non-album entries", () => {
    expect(
      mapITunesAlbumToProductResult({
        wrapperType: "track",
        trackName: "Buddy Holly",
        artistName: "Weezer",
      })
    ).toBeNull();
  });

  test("pickBestITunesAlbum prefers artwork and title relevance", () => {
    const best = pickBestITunesAlbum(
      [
        {
          wrapperType: "collection",
          collectionType: "Album",
          collectionName: "Blue",
        },
        {
          wrapperType: "collection",
          collectionType: "Album",
          collectionName: "Weezer (Blue Album)",
          artistName: "Weezer",
          artworkUrl100:
            "https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg/100x100bb.jpg",
        },
        {
          wrapperType: "collection",
          collectionType: "Album",
          collectionName: "Pinkerton",
          artworkUrl100:
            "https://is1-ssl.mzstatic.com/image/thumb/Music/y.jpg/100x100bb.jpg",
        },
      ],
      "Weezer Blue Album"
    );
    expect(best?.collectionName).toBe("Weezer (Blue Album)");
  });

  test("scoreITunesAlbumMatch prefers original artist album over tribute listings", () => {
    const query = "Kind of Blue Miles Davis";
    const original = scoreITunesAlbumMatch(
      {
        collectionName: "Kind of Blue",
        artistName: "Miles Davis",
      },
      query
    );
    const tribute = scoreITunesAlbumMatch(
      {
        collectionName: "Lullaby Versions of Kind of Blue & Miles Davis",
        artistName: "Twinkle Twinkle Little Rock Star",
      },
      query
    );
    expect(original).toBeGreaterThan(tribute);
    expect(
      pickBestITunesAlbum(
        [
          {
            wrapperType: "collection",
            collectionType: "Album",
            collectionName: "Lullaby Versions of Kind of Blue & Miles Davis",
            artistName: "Twinkle Twinkle Little Rock Star",
            artworkUrl100:
              "https://is1-ssl.mzstatic.com/image/thumb/Music/a.jpg/100x100bb.jpg",
          },
          {
            wrapperType: "collection",
            collectionType: "Album",
            collectionName: "Kind of Blue",
            artistName: "Miles Davis",
            artworkUrl100:
              "https://is1-ssl.mzstatic.com/image/thumb/Music/b.jpg/100x100bb.jpg",
          },
        ],
        query
      )?.collectionName
    ).toBe("Kind of Blue");
  });

  test("pickBestITunesAlbum rejects noisy UPC result sets without a query", () => {
    const noisy = Array.from({ length: 6 }, (_, i) => ({
      wrapperType: "collection" as const,
      collectionType: "Album",
      collectionName: `Album ${i}`,
      artworkUrl100:
        "https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg/100x100bb.jpg",
    }));
    expect(pickBestITunesAlbum(noisy)).toBeUndefined();
  });

  test("parseAppleProductPageHtml reads Open Graph metadata", () => {
    const hit = parseAppleProductPageHtml(
      `<html><head>
        <meta property="og:title" content="AirPods Pro" />
        <meta property="og:image" content="https://www.apple.com/v/airpods-pro/og.png" />
      </head></html>`,
      "AirPods Pro"
    );
    expect(hit).toEqual({
      title: "AirPods Pro",
      brand: "Apple",
      imageUrl: "https://www.apple.com/v/airpods-pro/og.png",
    });
  });
});

describe("retail packshot merge ranking", () => {
  test("prefers Amazon packshot over a weaker Wikipedia image for the same query", () => {
    const merged = mergeProductResults(
      {
        found: true,
        title: "Headphones",
        imageUrl: "https://upload.wikimedia.org/headphones.jpg",
        source: "wikipedia",
      },
      {
        found: true,
        title: "Sony WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black",
        imageUrl: "https://m.media-amazon.com/images/I/61O3iMlnJIL._AC_SL1000_.jpg",
        source: "amazon",
        originalPrice: 248,
        currency: "USD",
      },
      { query: "Sony WH-1000XM5" }
    );
    expect(merged?.source).toBe("amazon");
    expect(merged?.title).toContain("Sony WH-1000XM5");
    expect(merged?.originalPrice).toBe(248);
    expect(merged?.currency).toBe("USD");
  });

  test("fills originalPrice from the non-preferred hit when preferred lacks one", () => {
    // No query: primary image wins; secondary price should still fill the gap.
    const merged = mergeProductResults(
      {
        found: true,
        title: "Sony WH-1000XM5",
        imageUrl: "https://example.com/sony.jpg",
        source: "upcitemdb",
      },
      {
        found: true,
        title: "Sony WH-1000XM5 Wireless Headphones",
        brand: "Sony",
        source: "amazon",
        originalPrice: 248,
        currency: "USD",
      }
    );
    expect(merged?.source).toBe("upcitemdb");
    expect(merged?.originalPrice).toBe(248);
    expect(merged?.currency).toBe("USD");
  });
});

describe("product price helpers", () => {
  test("parseMoneyAmount handles common retail formats", () => {
    expect(parseMoneyAmount("$248.00")).toEqual({ amount: 248, currency: "USD" });
    expect(parseMoneyAmount("€12,99")).toEqual({ amount: 12.99, currency: "EUR" });
    expect(parseMoneyAmount(19.5, "GBP")).toEqual({ amount: 19.5, currency: "GBP" });
    expect(parseMoneyAmount("free")).toBeUndefined();
  });

  test("pickOfferMoney prefers offer price over list price", () => {
    expect(
      pickOfferMoney([
        { list_price: 99, price: 79.5, currency: "USD" },
      ])
    ).toEqual({ amount: 79.5, currency: "USD" });
  });

  test("parseAmazonCardPrice reads a-offscreen amounts", () => {
    expect(
      parseAmazonCardPrice(
        `<span class="a-price"><span class="a-offscreen">$248.00</span><span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">248</span></span></span>`
      )
    ).toEqual({ amount: 248, currency: "USD" });
  });
});

describe("rankProductLookupCandidates", () => {
  test("ranks distinct titles and dedupes near-identical ones", () => {
    const ranked = rankProductLookupCandidates(
      [
        {
          found: true,
          title: "The Great Gatsby",
          brand: "F. Scott Fitzgerald",
          source: "openlibrary",
        },
        {
          found: true,
          title: "The Great Gatsby",
          brand: "F. Scott Fitzgerald",
          imageUrl: "https://covers.example/gatsby.jpg",
          source: "google_books",
          originalPrice: 12,
          currency: "USD",
        },
        {
          found: true,
          title: "The Great Gatsby (Graphic Tee)",
          brand: "Merch Co",
          imageUrl: "https://example.com/tee.jpg",
          source: "upcitemdb",
        },
        {
          found: true,
          title: "iMac G4",
          brand: "Apple",
          imageUrl: "https://example.com/imac.jpg",
          source: "wikipedia",
        },
      ],
      "The Great Gatsby"
    );

    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked[0]?.title).toBe("The Great Gatsby");
    expect(ranked[0]?.source).toBe("google_books");
    expect(ranked[0]?.originalPrice).toBe(12);
    expect(
      ranked.filter((entry) => entry.title === "The Great Gatsby")
    ).toHaveLength(1);
  });

  test("caps the candidate list", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      found: true as const,
      title: `Product Variant ${index}`,
      imageUrl: `https://example.com/${index}.jpg`,
      source: "upcitemdb",
    }));
    expect(rankProductLookupCandidates(many, "Product").length).toBe(
      PRODUCT_LOOKUP_MAX_RESULTS
    );
  });
});

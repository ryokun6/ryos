export interface StuffLookupFields {
  title?: string;
  brand?: string;
  barcode?: string;
}

/** Build a product-lookup query from item metadata (barcode → title+brand → title → brand). */
export function buildStuffLookupQuery(
  fields: StuffLookupFields
): string | null {
  const barcode = fields.barcode?.trim();
  if (barcode) return barcode;

  const title = fields.title?.trim();
  const brand = fields.brand?.trim();

  if (title && brand) {
    const titleLower = title.toLowerCase();
    const brandLower = brand.toLowerCase();
    if (titleLower.includes(brandLower)) return title;
    return `${title} ${brand}`;
  }

  if (title) return title;
  if (brand) return brand;

  return null;
}

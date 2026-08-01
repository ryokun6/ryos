export const STUFF_HELP_I18N_KEYS = [
  "shelf",
  "scan",
  "tags",
  "prices",
  "share",
  "print",
] as const;

export const appMetadata = {
  name: "Stuff",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/stuff.png",
};

export const helpItems = [
  {
    icon: "📦",
    title: "Your Shelf",
    description:
      "Browse your inventory on wooden shelves. Click an item to edit details, status, and prices.",
  },
  {
    icon: "📷",
    title: "Scan Barcodes",
    description:
      "Use File ▸ Scan Barcode to capture UPC, EAN, Code 128, QR, and more. Product details fill in when found.",
  },
  {
    icon: "🏷️",
    title: "Tags",
    description:
      "Organize stuff with tags like Kitchen or Electronics. Filter the shelf from the sidebar.",
  },
  {
    icon: "💰",
    title: "Prices & Status",
    description:
      "Track original, discounted, and sold prices. Mark items as in use, stowed, for sale, sold, or discarded.",
  },
  {
    icon: "🔗",
    title: "Share & Bid",
    description:
      "Publish selected items to a public URL. Signed-in visitors can reserve items and place highest offers.",
  },
  {
    icon: "🖨️",
    title: "Print Labels",
    description:
      "Print barcode labels for selected items from File ▸ Print Labels.",
  },
];

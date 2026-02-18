/**
 * Utility functions for extracting and injecting applet metadata
 * from HTML comments at the top of HTML files
 */

export interface AppletMetadata {
  shareId?: string;
  name?: string;
  icon?: string;
  createdBy?: string;
  windowWidth?: number;
  windowHeight?: number;
  createdAt?: number;
  modifiedAt?: number;
}

type MetadataKey = keyof AppletMetadata;

const METADATA_COMMENT_PATTERN = /^<!--\s*([^:]+):\s*(.+?)\s*-->$/;

const METADATA_KEY_ORDER: MetadataKey[] = [
  "shareId",
  "name",
  "icon",
  "createdBy",
  "windowWidth",
  "windowHeight",
  "createdAt",
  "modifiedAt",
];

const parseMetadataNumber = (value: string): number | undefined =>
  parseInt(value, 10) || undefined;

const METADATA_FIELD_CONFIG: Record<
  MetadataKey,
  {
    parse: (value: string) => string | number | undefined;
    shouldInclude: (value: string | number | undefined) => boolean;
  }
> = {
  shareId: {
    parse: (value) => value,
    shouldInclude: (value) => Boolean(value),
  },
  name: {
    parse: (value) => value,
    shouldInclude: (value) => Boolean(value),
  },
  icon: {
    parse: (value) => value,
    shouldInclude: (value) => Boolean(value),
  },
  createdBy: {
    parse: (value) => value,
    shouldInclude: (value) => Boolean(value),
  },
  windowWidth: {
    parse: parseMetadataNumber,
    shouldInclude: (value) => value !== undefined,
  },
  windowHeight: {
    parse: parseMetadataNumber,
    shouldInclude: (value) => value !== undefined,
  },
  createdAt: {
    parse: parseMetadataNumber,
    shouldInclude: (value) => value !== undefined,
  },
  modifiedAt: {
    parse: parseMetadataNumber,
    shouldInclude: (value) => value !== undefined,
  },
};

function isMetadataKey(key: string): key is MetadataKey {
  return key in METADATA_FIELD_CONFIG;
}

/**
 * Extract metadata from HTML comments at the top of an HTML string
 * Looks for comments like:
 * <!-- shareId: abc123 -->
 * <!-- name: My Applet -->
 * etc.
 */
export function extractMetadataFromHtml(html: string): {
  metadata: AppletMetadata;
  content: string;
} {
  const metadata: AppletMetadata = {};
  const metadataRecord = metadata as Record<
    MetadataKey,
    string | number | undefined
  >;
  let content = html;

  // Match HTML comments at the start of the file (before any non-whitespace content)
  // Pattern: <!-- key: value -->
  // We'll match comments that appear at the beginning, separated by newlines
  const lines = html.split('\n');
  const metadataComments: string[] = [];
  let contentStartIndex = 0;
  let inMetadataSection = true;

  // Find all metadata comments at the start
  for (let i = 0; i < lines.length && inMetadataSection; i++) {
    const line = lines[i].trim();
    const commentMatch = line.match(METADATA_COMMENT_PATTERN);
    
    if (commentMatch) {
      // This is a metadata comment
      metadataComments.push(line);
    } else if (line === '') {
      // Empty line - continue in metadata section
      continue;
    } else {
      // Non-comment, non-empty line - we've reached the actual content
      contentStartIndex = i;
      inMetadataSection = false;
    }
  }

  // Extract metadata from comments
  for (const comment of metadataComments) {
    const match = comment.match(METADATA_COMMENT_PATTERN);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim();

    if (!isMetadataKey(key)) continue;
    metadataRecord[key] = METADATA_FIELD_CONFIG[key].parse(value);
  }

  // Remove metadata comments from content
  if (metadataComments.length > 0) {
    content = lines.slice(contentStartIndex).join('\n');
  }

  return { metadata, content };
}

/**
 * Inject metadata as HTML comments at the top of an HTML string
 * Adds comments like:
 * <!-- shareId: abc123 -->
 * <!-- name: My Applet -->
 * etc.
 */
export function injectMetadataIntoHtml(
  html: string,
  metadata: AppletMetadata
): string {
  const comments: string[] = [];
  const metadataRecord = metadata as Record<
    MetadataKey,
    string | number | undefined
  >;

  // Add metadata as comments (only if they exist)
  for (const key of METADATA_KEY_ORDER) {
    const value = metadataRecord[key];
    const config = METADATA_FIELD_CONFIG[key];
    if (!config.shouldInclude(value)) {
      continue;
    }
    comments.push(`<!-- ${key}: ${value} -->`);
  }

  // If no metadata to add, return original HTML
  if (comments.length === 0) {
    return html;
  }

  // Prepend comments to HTML
  return comments.join("\n") + "\n" + html;
}





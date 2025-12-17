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
    const commentMatch = line.match(/^<!--\s*([^:]+):\s*(.+?)\s*-->$/);
    
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
    const match = comment.match(/^<!--\s*([^:]+):\s*(.+?)\s*-->$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      switch (key) {
        case "shareId":
          metadata.shareId = value;
          break;
        case "name":
          metadata.name = value;
          break;
        case "icon":
          metadata.icon = value;
          break;
        case "createdBy":
          metadata.createdBy = value;
          break;
        case "windowWidth":
          metadata.windowWidth = parseInt(value, 10) || undefined;
          break;
        case "windowHeight":
          metadata.windowHeight = parseInt(value, 10) || undefined;
          break;
        case "createdAt":
          metadata.createdAt = parseInt(value, 10) || undefined;
          break;
        case "modifiedAt":
          metadata.modifiedAt = parseInt(value, 10) || undefined;
          break;
      }
    }
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

  // Add metadata as comments (only if they exist)
  if (metadata.shareId) {
    comments.push(`<!-- shareId: ${metadata.shareId} -->`);
  }
  if (metadata.name) {
    comments.push(`<!-- name: ${metadata.name} -->`);
  }
  if (metadata.icon) {
    comments.push(`<!-- icon: ${metadata.icon} -->`);
  }
  if (metadata.createdBy) {
    comments.push(`<!-- createdBy: ${metadata.createdBy} -->`);
  }
  if (metadata.windowWidth !== undefined) {
    comments.push(`<!-- windowWidth: ${metadata.windowWidth} -->`);
  }
  if (metadata.windowHeight !== undefined) {
    comments.push(`<!-- windowHeight: ${metadata.windowHeight} -->`);
  }
  if (metadata.createdAt !== undefined) {
    comments.push(`<!-- createdAt: ${metadata.createdAt} -->`);
  }
  if (metadata.modifiedAt !== undefined) {
    comments.push(`<!-- modifiedAt: ${metadata.modifiedAt} -->`);
  }

  // If no metadata to add, return original HTML
  if (comments.length === 0) {
    return html;
  }

  // Prepend comments to HTML
  return comments.join("\n") + "\n" + html;
}





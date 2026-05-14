import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface ApiRouteManifestEntry {
  filePath: string;
  relativePath: string;
  routePath: string;
  segmentCount: number;
  staticSegmentCount: number;
  dynamicSegmentCount: number;
  matcher: RegExp;
  paramNames: string[];
  isIndexRoute: boolean;
}

interface DiscoverManifestOptions {
  workspaceRoot?: string;
  apiRoot?: string;
}

async function walkDirectory(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const discoveredFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      discoveredFiles.push(...(await walkDirectory(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      discoveredFiles.push(fullPath);
    }
  }

  return discoveredFiles;
}

function isRouteFile(filePath: string, apiRoot: string): boolean {
  const relativePath = path.relative(apiRoot, filePath);
  const segments = relativePath.split(path.sep);
  const fileName = segments[segments.length - 1];

  if (!fileName.endsWith(".ts")) return false;
  if (fileName.startsWith("_")) return false;

  if (segments.slice(0, -1).some((segment) => segment.startsWith("_"))) {
    return false;
  }

  return true;
}

async function hasDefaultExport(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, "utf8");
  return /\bexport\s+default\b/.test(content);
}

function toRoutePath(relativePath: string): string {
  const noExtension = relativePath.replace(/\.ts$/, "");
  const rawSegments = noExtension.split(path.sep).filter(Boolean);
  const routeSegments: string[] = [];

  for (const segment of rawSegments) {
    if (segment === "index") continue;
    const dynamicMatch = segment.match(/^\[(.+)\]$/);
    if (dynamicMatch) {
      routeSegments.push(`:${dynamicMatch[1]}`);
      continue;
    }
    routeSegments.push(segment);
  }

  return routeSegments.length > 0 ? `/api/${routeSegments.join("/")}` : "/api";
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createRouteMatcher(routePath: string): {
  matcher: RegExp;
  paramNames: string[];
} {
  const segments = routePath.split("/").filter(Boolean);
  const regexSegments: string[] = [];
  const paramNames: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));
      regexSegments.push("([^/]+)");
      continue;
    }
    regexSegments.push(escapeRegex(segment));
  }

  const matcher =
    regexSegments.length === 0
      ? /^\/?$/
      : new RegExp(`^/${regexSegments.join("/")}/?$`);

  return { matcher, paramNames };
}

function compareRoutes(
  a: ApiRouteManifestEntry,
  b: ApiRouteManifestEntry
): number {
  if (a.staticSegmentCount !== b.staticSegmentCount) {
    return b.staticSegmentCount - a.staticSegmentCount;
  }

  if (a.dynamicSegmentCount !== b.dynamicSegmentCount) {
    return a.dynamicSegmentCount - b.dynamicSegmentCount;
  }

  if (a.segmentCount !== b.segmentCount) {
    return b.segmentCount - a.segmentCount;
  }

  return a.routePath.localeCompare(b.routePath);
}

export async function discoverApiRouteManifest(
  options: DiscoverManifestOptions = {}
): Promise<ApiRouteManifestEntry[]> {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const apiRoot = options.apiRoot || path.join(workspaceRoot, "api");
  const allFiles = await walkDirectory(apiRoot);
  const routeFiles = allFiles.filter((filePath) => isRouteFile(filePath, apiRoot));
  const routeDefinitions: ApiRouteManifestEntry[] = [];

  for (const filePath of routeFiles) {
    if (!(await hasDefaultExport(filePath))) continue;

    const relativePath = path.relative(apiRoot, filePath);
    const routePath = toRoutePath(relativePath);
    const routeSegments = routePath.split("/").filter(Boolean).slice(1);
    const dynamicSegmentCount = routeSegments.filter((part) =>
      part.startsWith(":")
    ).length;
    const staticSegmentCount = routeSegments.length - dynamicSegmentCount;
    const { matcher, paramNames } = createRouteMatcher(routePath);

    routeDefinitions.push({
      filePath,
      relativePath,
      routePath,
      segmentCount: routeSegments.length,
      staticSegmentCount,
      dynamicSegmentCount,
      matcher,
      paramNames,
      isIndexRoute: relativePath.endsWith(`${path.sep}index.ts`) || relativePath === "index.ts",
    });
  }

  return routeDefinitions.sort(compareRoutes);
}

export interface ViteApiRewrite {
  source: string;
  destination: string;
}

/**
 * For index-backed routes (e.g. api/songs/index.ts), Vercel plugin rewrites
 * /api/songs -> /api/songs/index in dev.
 */
export function buildViteApiRewrites(
  manifest: ApiRouteManifestEntry[]
): ViteApiRewrite[] {
  return manifest.reduce<ViteApiRewrite[]>((acc, route) => {
    if (
      !route.isIndexRoute ||
      route.routePath.includes(":") ||
      route.routePath === "/api"
    ) {
      return acc;
    }
    acc.push({
      source: route.routePath,
      destination: `${route.routePath}/index`,
    });
    return acc;
  }, [])
    .sort((a, b) => b.source.length - a.source.length || a.source.localeCompare(b.source));
}

